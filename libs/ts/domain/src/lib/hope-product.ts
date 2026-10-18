/**
 * EMA portal products (WV Hope Scholarship).
 *
 * A Hope lesson is billed in the EMA portal against one of the studio's
 * approved products ("Suzuki Violin Lesson - 30 min", "Old-Time Fiddle Lesson -
 * 60 min", …), each with its own EMA product id and price. That product, not a
 * table in code, is what the lesson is worth: the old length-only table priced a
 * 30-minute guitar lesson at $41.25 while EMA pays $30 for it, and teacher
 * payouts inherited the error.
 *
 * Katie keeps this list in step with the portal from the Hope Billing page, and
 * each Hope student is put on the product their award is billed under.
 */
import type { Student } from './student';

export interface HopeProduct {
  id: string;
  /** The id the EMA portal shows for this product (e.g. "103772"). */
  emaProductId: string;
  /** Exactly as it reads in the portal, so the two can be matched by eye. */
  name: string;
  /** EMA's approved price per lesson, in cents. */
  priceCents: number;
  /** Retired products stay for history but are not offered for new students. */
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SaveHopeProductInput = Omit<
  HopeProduct,
  'id' | 'createdAt' | 'updatedAt'
> & {
  /** Present to edit an existing product, absent to add one. */
  id?: string;
};

/**
 * Where a Hope lesson's price came from. `unpriced` means the student is on no
 * EMA product (or on one that no longer exists), so the lesson has no price at
 * all. There is deliberately no fallback: a guessed number shown as a price is
 * how a $30 lesson came to be shown, claimed and paid out as $41.25.
 */
export type HopeRateSource = 'product' | 'unpriced';

export type HopeLessonRate =
  | {
      source: 'product';
      rateCents: number;
      /** The product the rate came from. */
      product: HopeProduct;
    }
  | {
      source: 'unpriced';
      rateCents?: undefined;
      product?: undefined;
    };

/**
 * What one of this student's Hope lessons is worth.
 *
 * The student's EMA product when they have one (active or not: a retired
 * product still describes what past lessons were billed at). Otherwise the
 * lesson is `unpriced`, and every caller (the queue, the claim stamp, teacher
 * payouts) says so instead of inventing a number. Prices live only in data
 * Katie can edit: the products on the Hope Billing page and the price stamped
 * on each EMA order.
 */
export function resolveHopeLessonRate(
  student: Pick<Student, 'hopeProductId'>,
  productsById: ReadonlyMap<string, HopeProduct>
): HopeLessonRate {
  const product = student.hopeProductId
    ? productsById.get(student.hopeProductId)
    : undefined;
  if (product) {
    return { rateCents: product.priceCents, source: 'product', product };
  }
  return { source: 'unpriced' };
}

/** "$32.50", for product prices. */
export function formatHopePrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
