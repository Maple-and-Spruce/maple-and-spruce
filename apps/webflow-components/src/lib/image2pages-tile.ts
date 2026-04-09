/**
 * Tiling logic for the Image2Pages widget.
 *
 * Pure-browser implementation: takes a decoded image plus a sizing
 * description and produces a multi-page PDF that tiles the image across
 * one or more printable pages. No server side, no native deps.
 */
import { PDFDocument } from 'pdf-lib';

export type PageSizeKey = 'letter' | 'legal' | 'tabloid' | 'a4' | 'a3';

export const PAGE_SIZES: Record<PageSizeKey, [number, number]> = {
  letter: [612, 792],
  legal: [612, 1008],
  tabloid: [792, 1224],
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
};

export const PAGE_SIZE_LABELS: Record<PageSizeKey, string> = {
  letter: 'US Letter (8.5×11)',
  legal: 'US Legal (8.5×14)',
  tabloid: 'Tabloid (11×17)',
  a4: 'A4',
  a3: 'A3',
};

export interface Grid {
  cols: number;
  rows: number;
  orient: 'portrait' | 'landscape';
  pw: number;
  ph: number;
  scale: number;
  printedW: number;
  printedH: number;
}

export interface Layout {
  grid: Grid;
  pageW: number;
  pageH: number;
  marginPts: number;
  totalW: number;
  totalH: number;
  offsetX: number;
  offsetY: number;
  pxPerPt: number;
}

export type Sizing =
  | { kind: 'pages'; pageCount: number }
  | { kind: 'width'; inches: number }
  | { kind: 'height'; inches: number };

export const MAX_PAGES = 400;

/**
 * Given a fixed page count, find the grid + orientation that fits the image
 * with the largest possible printed area.
 */
export function bestGrid(
  pageCount: number,
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
): Grid {
  const pairs: Array<[number, number]> = [];
  for (let c = 1; c <= pageCount; c++) {
    if (pageCount % c === 0) pairs.push([c, pageCount / c]);
  }
  let best: Grid | null = null;
  for (const [cols, rows] of pairs) {
    for (const orient of ['portrait', 'landscape'] as const) {
      const pw = orient === 'portrait' ? pageW : pageH;
      const ph = orient === 'portrait' ? pageH : pageW;
      const totalW = cols * pw;
      const totalH = rows * ph;
      const scale = Math.min(totalW / imgW, totalH / imgH);
      const printedW = imgW * scale;
      const printedH = imgH * scale;
      if (!best || printedW * printedH > best.printedW * best.printedH) {
        best = { cols, rows, orient, pw, ph, scale, printedW, printedH };
      }
    }
  }
  return best!;
}

/**
 * Given a target printed dimension (width or height in inches), find the
 * smallest grid + page orientation that can accommodate the image at exactly
 * that scale.
 */
export function gridFromTargetSize(
  sizing: { kind: 'width' | 'height'; inches: number },
  imgW: number,
  imgH: number,
  printW: number,
  printH: number,
): Grid {
  if (!Number.isFinite(sizing.inches) || sizing.inches <= 0) {
    throw new Error(`Target ${sizing.kind} must be greater than 0`);
  }
  const targetPts = sizing.inches * 72;
  const scale = sizing.kind === 'width' ? targetPts / imgW : targetPts / imgH;
  const printedW = imgW * scale;
  const printedH = imgH * scale;

  let best: Grid | null = null;
  for (const orient of ['portrait', 'landscape'] as const) {
    const pw = orient === 'portrait' ? printW : printH;
    const ph = orient === 'portrait' ? printH : printW;
    const cols = Math.max(1, Math.ceil(printedW / pw - 1e-9));
    const rows = Math.max(1, Math.ceil(printedH / ph - 1e-9));
    const total = cols * rows;
    const wasted = cols * pw - printedW + (rows * ph - printedH);
    if (
      !best ||
      total < best.cols * best.rows ||
      (total === best.cols * best.rows &&
        wasted < best.cols * best.pw - best.printedW + (best.rows * best.ph - best.printedH))
    ) {
      best = { cols, rows, orient, pw, ph, scale, printedW, printedH };
    }
  }
  if (best!.cols * best!.rows > MAX_PAGES) {
    throw new Error(
      `That would require ${best!.cols * best!.rows} pages (max ${MAX_PAGES}). Try a smaller target size or a larger page size.`,
    );
  }
  return best!;
}

export function computeLayout(
  imgW: number,
  imgH: number,
  sizing: Sizing,
  pageSize: PageSizeKey,
  marginIn: number,
): Layout {
  const [PAGE_W, PAGE_H] = PAGE_SIZES[pageSize];
  const marginPts = marginIn * 72;
  const printW = PAGE_W - 2 * marginPts;
  const printH = PAGE_H - 2 * marginPts;
  if (printW <= 0 || printH <= 0) throw new Error('Margin too large for page');

  const grid =
    sizing.kind === 'pages'
      ? bestGrid(sizing.pageCount, imgW, imgH, printW, printH)
      : gridFromTargetSize(sizing, imgW, imgH, printW, printH);

  const pageW = grid.orient === 'portrait' ? PAGE_W : PAGE_H;
  const pageH = grid.orient === 'portrait' ? PAGE_H : PAGE_W;
  const totalW = grid.cols * grid.pw;
  const totalH = grid.rows * grid.ph;
  const offsetX = (totalW - grid.printedW) / 2;
  const offsetY = (totalH - grid.printedH) / 2;
  const pxPerPt = imgW / grid.printedW;
  return { grid, pageW, pageH, marginPts, totalW, totalH, offsetX, offsetY, pxPerPt };
}

/* c8 ignore start -- DOM/Canvas-bound, exercised in the browser only */
/**
 * Build a tiled PDF from a decoded image and computed layout. Each tile is
 * extracted via a 2D canvas, encoded as PNG, and embedded into the PDF page.
 */
export async function buildPdf(
  image: HTMLImageElement | ImageBitmap,
  layout: Layout,
): Promise<Uint8Array> {
  const { grid, pageW, pageH, marginPts, offsetX, offsetY, pxPerPt } = layout;
  const imgW = image.width;
  const imgH = image.height;

  const pdfDoc = await PDFDocument.create();

  const tileCanvas = document.createElement('canvas');
  const tileCtx = tileCanvas.getContext('2d');
  if (!tileCtx) throw new Error('Could not get 2d context');

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const tileX0 = c * grid.pw;
      const tileY0 = r * grid.ph;
      const tileX1 = tileX0 + grid.pw;
      const tileY1 = tileY0 + grid.ph;

      const ix0 = Math.max(tileX0, offsetX);
      const iy0 = Math.max(tileY0, offsetY);
      const ix1 = Math.min(tileX1, offsetX + grid.printedW);
      const iy1 = Math.min(tileY1, offsetY + grid.printedH);

      const page = pdfDoc.addPage([pageW, pageH]);

      if (ix1 > ix0 && iy1 > iy0) {
        const sx = Math.max(0, Math.round((ix0 - offsetX) * pxPerPt));
        const sy = Math.max(0, Math.round((iy0 - offsetY) * pxPerPt));
        let sw = Math.round((ix1 - ix0) * pxPerPt);
        let sh = Math.round((iy1 - iy0) * pxPerPt);
        sw = Math.min(sw, imgW - sx);
        sh = Math.min(sh, imgH - sy);

        tileCanvas.width = sw;
        tileCanvas.height = sh;
        tileCtx.clearRect(0, 0, sw, sh);
        tileCtx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

        const blob: Blob = await new Promise((resolve, reject) =>
          tileCanvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
            'image/png',
          ),
        );
        const buf = new Uint8Array(await blob.arrayBuffer());
        const embedded = await pdfDoc.embedPng(buf);

        const drawWidth = ix1 - ix0;
        const drawHeight = iy1 - iy0;
        const drawX = marginPts + (ix0 - tileX0);
        const topFromPageTop = marginPts + (iy0 - tileY0);
        const drawY = pageH - topFromPageTop - drawHeight;

        page.drawImage(embedded, {
          x: drawX,
          y: drawY,
          width: drawWidth,
          height: drawHeight,
        });
      }
    }
  }

  return pdfDoc.save();
}

export async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}
/* c8 ignore stop */
