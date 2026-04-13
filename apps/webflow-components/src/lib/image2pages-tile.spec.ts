import { describe, expect, it } from 'vitest';
import {
  bestGrid,
  computeLayout,
  gridFromTargetSize,
  MAX_PAGES,
  PAGE_SIZES,
} from './image2pages-tile';

const [LETTER_W, LETTER_H] = PAGE_SIZES.letter;
const LETTER_PRINT_W = LETTER_W - 2 * 36; // 0.5in margin
const LETTER_PRINT_H = LETTER_H - 2 * 36;

describe('bestGrid', () => {
  it('returns a 1x1 grid for a single page', () => {
    const g = bestGrid(1, 800, 600, LETTER_PRINT_W, LETTER_PRINT_H);
    expect(g.cols).toBe(1);
    expect(g.rows).toBe(1);
  });

  it('picks landscape orientation for a wide image on a single page', () => {
    const g = bestGrid(1, 1600, 400, LETTER_PRINT_W, LETTER_PRINT_H);
    expect(g.orient).toBe('landscape');
  });

  it('picks portrait orientation for a tall image on a single page', () => {
    const g = bestGrid(1, 400, 1600, LETTER_PRINT_W, LETTER_PRINT_H);
    expect(g.orient).toBe('portrait');
  });

  it('maximizes printed area when given multiple page-count factor pairs', () => {
    // 4 pages: factor pairs are (1,4),(2,2),(4,1) -- pick whichever maximizes area
    const g = bestGrid(4, 1000, 1000, LETTER_PRINT_W, LETTER_PRINT_H);
    expect(g.cols * g.rows).toBe(4);
    // For a square image, 2x2 should give a larger printed area than 1x4 or 4x1
    expect(g.cols).toBe(2);
    expect(g.rows).toBe(2);
  });

  it('preserves the source aspect ratio in the printed dimensions', () => {
    const g = bestGrid(2, 2000, 1000, LETTER_PRINT_W, LETTER_PRINT_H);
    const aspect = g.printedW / g.printedH;
    expect(aspect).toBeCloseTo(2, 5);
  });
});

describe('gridFromTargetSize', () => {
  it('throws if the target dimension is non-positive', () => {
    expect(() =>
      gridFromTargetSize({ kind: 'width', inches: 0 }, 800, 600, LETTER_PRINT_W, LETTER_PRINT_H),
    ).toThrow();
    expect(() =>
      gridFromTargetSize({ kind: 'height', inches: -3 }, 800, 600, LETTER_PRINT_W, LETTER_PRINT_H),
    ).toThrow();
  });

  it('uses a single page when the target fits within one printable area', () => {
    // 4in wide on letter (7.5in printable) -- fits in 1 page
    const g = gridFromTargetSize(
      { kind: 'width', inches: 4 },
      800,
      600,
      LETTER_PRINT_W,
      LETTER_PRINT_H,
    );
    expect(g.cols * g.rows).toBe(1);
  });

  it('scales the image so the printed width matches the requested target', () => {
    const g = gridFromTargetSize(
      { kind: 'width', inches: 20 },
      800,
      600,
      LETTER_PRINT_W,
      LETTER_PRINT_H,
    );
    expect(g.printedW).toBeCloseTo(20 * 72, 5);
    expect(g.printedH).toBeCloseTo(15 * 72, 5);
  });

  it('scales the image so the printed height matches the requested target', () => {
    const g = gridFromTargetSize(
      { kind: 'height', inches: 30 },
      800,
      600,
      LETTER_PRINT_W,
      LETTER_PRINT_H,
    );
    expect(g.printedH).toBeCloseTo(30 * 72, 5);
    expect(g.printedW).toBeCloseTo(40 * 72, 5);
  });

  it('uses just enough columns and rows to cover the printed area', () => {
    // 20in wide image on letter (7.5in printable width portrait, 10in landscape)
    // Landscape 10in/page width -> ceil(20/10) = 2 cols
    // 15in tall image -> ceil(15/7.5) = 2 rows landscape
    const g = gridFromTargetSize(
      { kind: 'width', inches: 20 },
      800,
      600,
      LETTER_PRINT_W,
      LETTER_PRINT_H,
    );
    expect(g.cols * g.rows).toBeGreaterThanOrEqual(4);
    // Sanity: enough pages to cover the printed area
    expect(g.cols * g.pw).toBeGreaterThanOrEqual(g.printedW - 1e-6);
    expect(g.rows * g.ph).toBeGreaterThanOrEqual(g.printedH - 1e-6);
  });

  it('throws when the requested size would exceed the page-count safety cap', () => {
    expect(() =>
      gridFromTargetSize(
        { kind: 'width', inches: 1000 },
        800,
        600,
        LETTER_PRINT_W,
        LETTER_PRINT_H,
      ),
    ).toThrow(new RegExp(String(MAX_PAGES)));
  });
});

describe('computeLayout', () => {
  it('throws if margins are larger than the page', () => {
    expect(() => computeLayout(800, 600, { kind: 'pages', pageCount: 1 }, 'letter', 10)).toThrow();
  });

  it('centers the printed image within the total tiled area', () => {
    const layout = computeLayout(800, 600, { kind: 'pages', pageCount: 1 }, 'letter', 0.5);
    // offsetX/offsetY each = (totalDim - printedDim) / 2 -- both >= 0 and <= total
    expect(layout.offsetX).toBeGreaterThanOrEqual(0);
    expect(layout.offsetY).toBeGreaterThanOrEqual(0);
    expect(layout.offsetX * 2 + layout.grid.printedW).toBeCloseTo(layout.totalW, 5);
    expect(layout.offsetY * 2 + layout.grid.printedH).toBeCloseTo(layout.totalH, 5);
  });

  it('uses page dimensions corresponding to the chosen orientation', () => {
    const wide = computeLayout(2000, 500, { kind: 'pages', pageCount: 1 }, 'letter', 0.5);
    expect(wide.pageW).toBe(LETTER_H); // landscape -> page width is the long edge
    expect(wide.pageH).toBe(LETTER_W);

    const tall = computeLayout(500, 2000, { kind: 'pages', pageCount: 1 }, 'letter', 0.5);
    expect(tall.pageW).toBe(LETTER_W);
    expect(tall.pageH).toBe(LETTER_H);
  });

  it('produces consistent pxPerPt = imgW / printedW', () => {
    const layout = computeLayout(1600, 1200, { kind: 'pages', pageCount: 4 }, 'letter', 0.5);
    expect(layout.pxPerPt).toBeCloseTo(1600 / layout.grid.printedW, 5);
  });

  it('honors a width-based sizing request end-to-end', () => {
    const layout = computeLayout(1000, 500, { kind: 'width', inches: 10 }, 'letter', 0.5);
    expect(layout.grid.printedW).toBeCloseTo(10 * 72, 5);
    expect(layout.grid.printedH).toBeCloseTo(5 * 72, 5);
  });
});
