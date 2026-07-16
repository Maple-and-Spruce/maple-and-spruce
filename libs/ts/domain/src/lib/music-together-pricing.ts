/**
 * Music Together per-child sibling pricing
 *
 * MT tuition is charged PER CHILD with a sibling discount: the first child pays
 * full price and every additional child (the 2nd and 3rd) is 50% off. The same
 * multiplier is applied identically to the pay-in-full total AND to every
 * installment, so a family paying in two installments sees the discount on both
 * the registration-time charge and the scheduled Week-5 charge.
 *
 *   multiplier m = 1 + 0.5 * (numChildren - 1)
 *     1 child  → 1.0   (full price)
 *     2 kids   → 1.5   (+50%)
 *     3 kids   → 2.0   (+100%)
 *
 * This is the SINGLE source of truth for the math: both the server
 * (`createMusicTogetherRegistration`, authoritative) and the public widget
 * (`MusicTogetherRegistrationWidget`, display) call it so their numbers can
 * never drift. The server never trusts a client-sent amount — it recomputes
 * here from the section's configured base prices.
 *
 * All amounts are integer cents (`Math.round` after multiplying).
 */
import { MT_MAX_CHILDREN } from './music-together-registration';

/**
 * The minimal shape this helper needs from a section: the pay-in-full base
 * price and the (optional) installment plan. Generic over the installment
 * item's `dueAt` type so it works with both the server's `Date` sections and
 * the public widget's ISO-string sections — the helper only ever multiplies
 * `amountCents` and passes `dueAt` through untouched.
 */
export interface MusicTogetherPriceableSection<Item extends { amountCents: number }> {
  /** Pay-in-full base price for ONE child, in cents. */
  priceFullCents: number;
  /** Configured installment plan (base, one-child amounts). */
  installmentPlan?: Item[];
}

/** The discounted family price for a given number of children. */
export interface MusicTogetherFamilyPrice<Item extends { amountCents: number }> {
  /** Number of children priced (validated 1..MT_MAX_CHILDREN). */
  numChildren: number;
  /** Sibling-discount multiplier applied to every amount. */
  multiplier: number;
  /** Discounted pay-in-full total, in cents. */
  fullCents: number;
  /**
   * The section's installment plan with the multiplier applied to each item's
   * `amountCents`. Ordered like the source plan: item 0 is charged at
   * registration, items 1..N become scheduled card-on-file charges. Every
   * non-amount field (e.g. `dueAt`) is preserved unchanged. Empty when the
   * section has no plan.
   */
  installments: Item[];
}

/**
 * The sibling-discount multiplier for a family: first child full price, 50% off
 * each additional child. Throws when `numChildren` is not an integer in
 * `1..MT_MAX_CHILDREN`.
 */
export function mtSiblingMultiplier(numChildren: number): number {
  if (!Number.isInteger(numChildren)) {
    throw new RangeError(
      `Music Together child count must be a whole number, got ${numChildren}`
    );
  }
  if (numChildren < 1 || numChildren > MT_MAX_CHILDREN) {
    throw new RangeError(
      `Music Together supports 1 to ${MT_MAX_CHILDREN} children per family, got ${numChildren}`
    );
  }
  return 1 + 0.5 * (numChildren - 1);
}

/**
 * Compute the discounted family price (pay-in-full total + discounted
 * installment plan) for a section and a number of children.
 *
 * The multiplier is applied to `priceFullCents` and to EACH installment's
 * `amountCents`; results are rounded to whole cents. `dueAt` (and any other
 * installment field) is carried through unchanged, so callers keep whatever
 * date representation their section uses.
 *
 * @throws RangeError if `numChildren` is not an integer in 1..MT_MAX_CHILDREN.
 */
export function computeMusicTogetherFamilyPrice<
  Item extends { amountCents: number }
>(
  section: MusicTogetherPriceableSection<Item>,
  numChildren: number
): MusicTogetherFamilyPrice<Item> {
  const multiplier = mtSiblingMultiplier(numChildren);
  const fullCents = Math.round(section.priceFullCents * multiplier);
  const installments = (section.installmentPlan ?? []).map((item) => ({
    ...item,
    amountCents: Math.round(item.amountCents * multiplier),
  }));
  return { numChildren, multiplier, fullCents, installments };
}
