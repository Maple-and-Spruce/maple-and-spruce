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

/**
 * The studio's page in the Hope Scholarship Marketplace, as a parent sees it.
 *
 * Families cannot find us by searching the Marketplace, and the portal has no
 * link to a single product, so what gets sent is this page plus the exact
 * product name to search for on its Products & Services tab. It only opens for
 * a signed-in parent; signed out it goes to the Hope sign-in page.
 */
export const HOPE_STOREFRONT_URL =
  'https://app.hopescholarshipwv.com/esa/esa_parent/esa_vendors/17203';

/**
 * A ready-to-send note telling a family how to order lessons through Hope:
 * the storefront link, and, given a product, its exact name and price.
 */
export function hopeFamilyMessage(
  product?: Pick<HopeProduct, 'name' | 'priceCents'>
): string {
  const lines = [
    'To order lessons with Maple & Spruce through your Hope Scholarship, sign in to your Hope account, then open our page:',
    '',
    HOPE_STOREFRONT_URL,
    '',
    'If Hope takes you to your dashboard instead, click the link again once you are signed in.',
  ];
  if (product) {
    lines.push(
      '',
      `On the Products & Services tab, search for "${product.name}" and order that one (${formatHopePrice(product.priceCents)} per lesson). Order as many lessons as you would like to cover.`
    );
  } else {
    lines.push(
      '',
      'Our lessons are listed on the Products & Services tab. Let us know if you are not sure which one to order.'
    );
  }
  return lines.join('\n');
}
