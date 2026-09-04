import { describe, it, expect } from 'vitest';
import {
  needsProgramBackfill,
  selectForBackfill,
  describeDoc,
  chunkForBatches,
  BACKFILL_PROGRAM,
  FIRESTORE_BATCH_LIMIT,
} from './backfill-discount-program-core';

describe('needsProgramBackfill', () => {
  it('selects a document with no program at all', () => {
    // The case that matters: everything written before #791.
    expect(needsProgramBackfill({ id: 'a', code: 'SAVE10' })).toBe(true);
  });

  it('leaves a correctly scoped document alone', () => {
    expect(
      needsProgramBackfill({ id: 'a', code: 'SAVE10', program: 'classes' })
    ).toBe(false);
    expect(
      needsProgramBackfill({ id: 'b', code: 'PILOT', program: 'music-together' })
    ).toBe(false);
  });

  it.each([
    ['an empty string', ''],
    ['a number', 1],
    ['null', null],
    ['an object', { program: 'classes' }],
    ['an unrecognised program', 'lessons'],
  ])('selects %s — all are equally invisible to the query', (_label, value) => {
    expect(needsProgramBackfill({ id: 'a', program: value })).toBe(true);
  });
});

describe('selectForBackfill', () => {
  it('returns only the documents needing a write, in order', () => {
    const docs = [
      { id: '1', code: 'A', program: 'classes' },
      { id: '2', code: 'B' },
      { id: '3', code: 'C', program: 'music-together' },
      { id: '4', code: 'D', program: '' },
    ];

    expect(selectForBackfill(docs).map((d) => d.id)).toEqual(['2', '4']);
  });

  it('is empty once the backfill has run', () => {
    // Idempotency: a second run must be a no-op, so it is safe to re-run
    // after a partial failure.
    const docs = [
      { id: '1', program: 'classes' },
      { id: '2', program: 'classes' },
    ];

    expect(selectForBackfill(docs)).toEqual([]);
  });

  it('handles an empty collection', () => {
    expect(selectForBackfill([])).toEqual([]);
  });
});

describe('BACKFILL_PROGRAM', () => {
  it('is classes — MT had no discount support before scoping', () => {
    // Assigning 'music-together' would make old Maple & Spruce codes
    // redeemable against a different business's Square account.
    expect(BACKFILL_PROGRAM).toBe('classes');
  });
});

describe('describeDoc', () => {
  it('names the code and what it is changing from', () => {
    expect(describeDoc({ id: 'x1', code: 'SAVE10' })).toBe(
      'SAVE10 (program absent) -> classes'
    );
    expect(describeDoc({ id: 'x1', code: 'SAVE10', program: 'lessons' })).toBe(
      "SAVE10 (program 'lessons') -> classes"
    );
  });

  it('falls back to the document id when the code is missing', () => {
    expect(describeDoc({ id: 'x1' })).toBe('x1 (program absent) -> classes');
  });
});

describe('chunkForBatches', () => {
  it('defaults to Firestore’s 500-operation write limit', () => {
    expect(FIRESTORE_BATCH_LIMIT).toBe(500);

    const chunks = chunkForBatches(Array.from({ length: 1200 }, (_, i) => i));
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 200]);
  });

  it('returns a single chunk when everything fits', () => {
    expect(chunkForBatches([1, 2, 3], 500)).toEqual([[1, 2, 3]]);
  });

  it('returns nothing for an empty list — no empty batch is committed', () => {
    expect(chunkForBatches([])).toEqual([]);
  });

  it('rejects a nonsense batch size rather than looping forever', () => {
    expect(() => chunkForBatches([1, 2], 0)).toThrow(RangeError);
  });
});
