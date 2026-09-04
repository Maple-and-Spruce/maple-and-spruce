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
import { applyDiscount, type Discount } from './discount';
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

/**
 * A family price with a discount code applied.
 */
export interface DiscountedMusicTogetherFamilyPrice<
  Item extends { amountCents: number }
> extends MusicTogetherFamilyPrice<Item> {
  /** The code that was applied, uppercased. */
  discountCode: string;
  /**
   * Cents taken off the pay-in-full price.
   *
   * Deliberately separate from `installmentsDiscountCents`: the two plans are
   * priced independently (the installment plan carries a premium), so a single
   * "discount amount" would be wrong for whichever plan the family didn't
   * pick. Callers record the one matching their `paymentPlan`.
   */
  fullDiscountCents: number;
  /** Cents taken off the installment plan's total. 0 when there is no plan. */
  installmentsDiscountCents: number;
}

/**
 * Distribute `targetTotalCents` across `weights` so the parts sum to exactly
 * the target, apportioned by weight. Largest-remainder: floor every share,
 * then hand the leftover cents to the entries with the biggest fractional
 * parts (ties break toward the earlier installment, so the family pays the
 * extra cent sooner rather than later).
 */
function distributeByWeight(
  targetTotalCents: number,
  weights: number[]
): number[] {
  const weightTotal = weights.reduce((sum, w) => sum + w, 0);
  if (weightTotal <= 0) {
    // Nothing to apportion against — spread evenly rather than divide by zero.
    return weights.map(() => 0);
  }
  const exact = weights.map((w) => (targetTotalCents * w) / weightTotal);
  const floors = exact.map(Math.floor);
  let leftover = targetTotalCents - floors.reduce((sum, f) => sum + f, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const result = [...floors];
  for (const { index } of order) {
    if (leftover <= 0) break;
    result[index] += 1;
    leftover -= 1;
  }
  return result;
}

/**
 * Apply a discount code to an already-computed family price.
 *
 * The discount reaches EVERY amount the family will be charged, not just the
 * one taken at registration: `fullCents` and each installment (including the
 * ones that become scheduled card-on-file charges). A "50% off" code therefore
 * halves the Week-5 charge too — which is the only reading that makes the
 * headline promise true.
 *
 * Pay-in-full and the installment plan are discounted **independently**,
 * because they are independent prices — the plan carries a premium (2 x $132 =
 * $264 against $252 paid in full), and the family picks exactly one. For a
 * `percent` code that distinction is invisible (both scale by the same factor).
 * It matters for a fixed `amount` code, which comes off the **plan total once**
 * and is then apportioned across the installments — never subtracted from each
 * installment separately, which would give away several times the face value.
 *
 * `appliesTo: 'nth-slot-onward'` is rejected: MT has no per-slot pricing to
 * count against, and additional children are already discounted by the sibling
 * multiplier. Silently treating it as an order discount would over-apply it.
 *
 * @throws RangeError when the discount is slot-scoped.
 */
export function mtApplyDiscount<Item extends { amountCents: number }>(
  price: MusicTogetherFamilyPrice<Item>,
  discount: Discount,
  now: Date = new Date()
): DiscountedMusicTogetherFamilyPrice<Item> {
  if (discount.appliesTo === 'nth-slot-onward') {
    throw new RangeError(
      `Discount code ${discount.code} is scoped to individual class slots and can't be used for Music Together.`
    );
  }

  const fullCents = applyDiscount(
    discount,
    { unitPriceCents: price.fullCents, quantity: 1 },
    now
  ).updatedCents;

  const planTotalCents = price.installments.reduce(
    (sum, item) => sum + item.amountCents,
    0
  );
  const discountedPlanTotalCents = applyDiscount(
    discount,
    { unitPriceCents: planTotalCents, quantity: 1 },
    now
  ).updatedCents;
  const shares = distributeByWeight(
    discountedPlanTotalCents,
    price.installments.map((item) => item.amountCents)
  );
  const installments = price.installments.map((item, i) => ({
    ...item,
    amountCents: shares[i],
  }));

  return {
    ...price,
    fullCents,
    installments,
    discountCode: discount.code.toUpperCase(),
    fullDiscountCents: price.fullCents - fullCents,
    installmentsDiscountCents: planTotalCents - discountedPlanTotalCents,
  };
}
