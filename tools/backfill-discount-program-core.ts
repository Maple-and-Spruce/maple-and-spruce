/**
 * Pure selection logic for the `Discount.program` backfill (#791).
 *
 * No firebase-admin imports — self-contained and unit-testable. The runnable
 * script (`backfill-discount-program.ts`) does the Firestore I/O and calls
 * this.
 *
 * Program scoping made `program` a required field and the admin pages filter
 * on it IN THE QUERY, which Firestore can only satisfy for documents that
 * actually carry it:
 *
 *   "A document is included in the index only if it has an indexed value set
 *    for every field used in the index... the document will never be returned
 *    as a result for any query based on the index."
 *   https://firebase.google.com/docs/firestore/query-data/index-overview
 *
 * So a discount written before scoping is invisible to BOTH admin pages until
 * this runs. That makes the backfill a prerequisite for the query, not a
 * tidy-up.
 */

/** The minimum a stored discount needs for this decision. */
export interface StoredDiscountLite {
  id: string;
  /** Uppercased code, for human-readable output. May be absent on junk docs. */
  code?: unknown;
  /** Whatever is stored — the point is that it is often missing entirely. */
  program?: unknown;
}

/**
 * Program assigned to every document that lacks one.
 *
 * A statement of fact, not a default: Music Together had no discount support
 * before #791, so no pre-existing code could have belonged to it. Assigning
 * the other way would make old Maple & Spruce codes redeemable against
 * Stephanie's separate Square account.
 */
export const BACKFILL_PROGRAM = 'classes';

/** Valid stored values; anything else counts as needing a backfill. */
const VALID_PROGRAMS = new Set(['classes', 'music-together']);

/**
 * Whether a stored document still needs `program` written.
 *
 * Treats an empty string, a non-string, and an unrecognised value as missing:
 * all three are equally invisible to `where('program','==',…)`, so all three
 * need fixing. Only a recognised program is left alone.
 */
export function needsProgramBackfill(doc: StoredDiscountLite): boolean {
  return typeof doc.program !== 'string' || !VALID_PROGRAMS.has(doc.program);
}

/** The documents to write, in input order. */
export function selectForBackfill<T extends StoredDiscountLite>(
  docs: readonly T[]
): T[] {
  return docs.filter(needsProgramBackfill);
}

/** Human-readable label for dry-run output. */
export function describeDoc(doc: StoredDiscountLite): string {
  const code = typeof doc.code === 'string' && doc.code ? doc.code : doc.id;
  const current =
    typeof doc.program === 'string' && doc.program
      ? `'${doc.program}'`
      : 'absent';
  return `${code} (program ${current}) -> ${BACKFILL_PROGRAM}`;
}

/**
 * Split a list into Firestore-sized write batches.
 *
 * Firestore caps a batched write at 500 operations:
 * https://firebase.google.com/docs/firestore/manage-data/transactions
 */
export const FIRESTORE_BATCH_LIMIT = 500;

export function chunkForBatches<T>(
  items: readonly T[],
  size: number = FIRESTORE_BATCH_LIMIT
): T[][] {
  if (size < 1) {
    throw new RangeError(`Batch size must be at least 1, got ${size}`);
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
