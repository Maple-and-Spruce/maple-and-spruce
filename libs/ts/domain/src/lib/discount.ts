/**
 * Discount domain types
 *
 * Implements a discount system modeled after Mountain Sol Platform's pattern,
 * adapted to use discriminated unions (instead of abstract classes) for
 * consistency with the Maple & Spruce codebase.
 *
 * Supports three discount types:
 * - percent: Percentage off the total (e.g., 10% off)
 * - amount: Fixed dollar amount off (e.g., $5 off)
 * - amount-before-date: Fixed amount off before a cutoff date (early bird)
 *
 * @see ADR-021 for Square payment integration context
 */

/**
 * Supported discount types
 */
export type DiscountType = 'percent' | 'amount' | 'amount-before-date';

/**
 * Valid discount type values (for validation)
 */
export const DISCOUNT_TYPES: DiscountType[] = [
  'percent',
  'amount',
  'amount-before-date',
];

/**
 * Which program's checkout a code may be redeemed at.
 *
 * A discount belongs to exactly ONE program. Codes are globally unique, so a
 * code is looked up the same way everywhere and then checked against the
 * program doing the asking — a mismatch is rejected rather than silently
 * ignored.
 *
 * This exists because the two checkouts bill to **different businesses**:
 * Maple & Spruce classes settle to the M&S Square account, Music Together to
 * Stephanie's separate LLC account. An unscoped code would let a Music
 * Together promotion take money off a craft class (and vice versa), moving
 * value between two companies' books.
 *
 * It also draws the authorization line: an mt-teacher manages
 * `music-together` codes and nothing else.
 */
export type DiscountProgram = 'classes' | 'music-together';

export const DISCOUNT_PROGRAMS: DiscountProgram[] = ['classes', 'music-together'];

/** Program assumed for any discount stored before scoping existed (#791). */
export const LEGACY_DISCOUNT_PROGRAM: DiscountProgram = 'classes';

/** Human label for a program, for admin UI and error messages. */
export function discountProgramLabel(program: DiscountProgram): string {
  return program === 'music-together' ? 'Music Together' : 'Maple & Spruce classes';
}

/**
 * Discount status
 */
export type DiscountStatus = 'active' | 'inactive';

/**
 * Valid discount status values (for validation)
 */
export const DISCOUNT_STATUSES: DiscountStatus[] = ['active', 'inactive'];

/**
 * How a discount applies to a multi-slot registration.
 * - 'order': discount applies to the order subtotal (current behavior)
 * - 'nth-slot-onward': discount applies per slot, starting at slot N (1-indexed).
 *   Used for pair-pricing promos like "second slot 50% off" (nthSlot=2).
 */
export type DiscountAppliesTo = 'order' | 'nth-slot-onward';

export const DISCOUNT_APPLIES_TO: DiscountAppliesTo[] = [
  'order',
  'nth-slot-onward',
];

/**
 * Shared fields across all discount types
 */
interface DiscountBase {
  id: string;
  /** Unique code customers enter (stored uppercase) */
  code: string;
  /** Human-readable description (e.g., "Early bird special - $10 off") */
  description: string;
  /**
   * The one checkout this code works at. Immutable after creation, like
   * `type` — repointing a live code at another program would change what a
   * customer holding it can buy, and on whose books.
   */
  program: DiscountProgram;
  /** Whether this discount can currently be used */
  status: DiscountStatus;
  /** How the discount applies to multi-slot registrations */
  appliesTo: DiscountAppliesTo;
  /**
   * For appliesTo='nth-slot-onward', the 1-indexed slot at which the
   * discount starts applying (and applies to that slot and every slot after).
   * Ignored when appliesTo='order'.
   */
  nthSlot: number;
  /**
   * Maximum number of times this code can be redeemed. `null` means
   * unlimited. Once `usageCount` reaches this value, the code is rejected
   * by `isDiscountValid`. Usage is consumed at reservation time and is NOT
   * restored if the registration is later cancelled — single-use means
   * single-use.
   */
  usageLimit: number | null;
  /** Total successful redemptions; incremented atomically at reservation. */
  usageCount: number;
  /**
   * Optional global expiration. Once `now > expiresAt`, the code is
   * rejected regardless of status. Distinct from
   * `amount-before-date.cutoffDate`, which only ungates the early-bird
   * pricing for that one type.
   */
  expiresAt?: Date;
  /**
   * For codes auto-generated from a successful registration (referral
   * codes), the registration ID that produced this code. Set by the
   * referral-program flow; ignored otherwise. Reserved for the follow-up
   * referral PR.
   */
  generatedFromRegistrationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Percentage discount (e.g., 10% off)
 */
export interface PercentDiscountData extends DiscountBase {
  type: 'percent';
  /** Percentage to deduct (1-100) */
  percent: number;
}

/**
 * Fixed amount discount (e.g., $5 off)
 */
export interface AmountDiscountData extends DiscountBase {
  type: 'amount';
  /** Amount in cents to deduct */
  amountCents: number;
}

/**
 * Early bird discount: fixed amount off before a cutoff date
 */
export interface AmountBeforeDateDiscountData extends DiscountBase {
  type: 'amount-before-date';
  /** Amount in cents to deduct */
  amountCents: number;
  /** Discount expires after this date */
  cutoffDate: Date;
}

/**
 * Discriminated union of all discount types
 */
export type Discount =
  | PercentDiscountData
  | AmountDiscountData
  | AmountBeforeDateDiscountData;

/**
 * Input for creating a new discount (no id or timestamps)
 */
export type CreateDiscountInput = Omit<
  Discount,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Whether a code may be redeemed at the given program's checkout.
 *
 * Separate from `isDiscountValid` on purpose: validity is about the code's own
 * lifecycle (active, unexpired, uses left), while this is about *where* it is
 * being presented. Callers check both, and report them differently — an
 * out-of-program code is not "expired", it was never usable here.
 */
export function isDiscountForProgram(
  discount: Pick<Discount, 'program'>,
  program: DiscountProgram
): boolean {
  return discount.program === program;
}

/**
 * Input for updating a discount
 * All fields optional except id; type and program cannot be changed
 */
export type UpdateDiscountInput = {
  id: string;
  code?: string;
  description?: string;
  status?: DiscountStatus;
  appliesTo?: DiscountAppliesTo;
  nthSlot?: number;
  usageLimit?: number | null;
  expiresAt?: Date | null;
  percent?: number;
  amountCents?: number;
  cutoffDate?: Date;
};

/**
 * Result of applying a discount to a total
 */
export interface DiscountApplicationResult {
  /** The new total after discount */
  updatedCents: number;
  /** The amount discounted */
  discountAmountCents: number;
}

/**
 * Pricing context for applyDiscount: a unit price and a quantity.
 * The function needs both (not just a total) so it can apply per-slot
 * discounts like "second slot 50% off."
 */
export interface DiscountPricingContext {
  unitPriceCents: number;
  quantity: number;
}

/**
 * Apply a discount to a registration's pricing.
 *
 * Ensures the result is never negative (minimum $0).
 * For amount-before-date discounts, checks the cutoff date against `now`.
 * For appliesTo='nth-slot-onward', the discount applies per slot starting
 * at `nthSlot` (1-indexed); slots before that are charged at full price.
 *
 * @param discount The discount to apply
 * @param context  unitPriceCents and quantity
 * @param now      Optional current time (for testing)
 */
export function applyDiscount(
  discount: Discount,
  context: DiscountPricingContext,
  now: Date = new Date()
): DiscountApplicationResult {
  const { unitPriceCents, quantity } = context;
  const baseTotalCents = unitPriceCents * quantity;

  // Past-cutoff short-circuit for amount-before-date.
  if (discount.type === 'amount-before-date') {
    const cutoff =
      discount.cutoffDate instanceof Date
        ? discount.cutoffDate
        : new Date(discount.cutoffDate);
    if (now > cutoff) {
      return { updatedCents: baseTotalCents, discountAmountCents: 0 };
    }
  }

  if (discount.appliesTo === 'nth-slot-onward') {
    const discountedSlots = Math.max(0, quantity - discount.nthSlot + 1);
    if (discountedSlots === 0) {
      return { updatedCents: baseTotalCents, discountAmountCents: 0 };
    }
    const perSlotDiscountCents = computePerSlotDiscount(
      discount,
      unitPriceCents
    );
    const totalDiscountCents = Math.min(
      perSlotDiscountCents * discountedSlots,
      baseTotalCents
    );
    return {
      updatedCents: Math.max(0, baseTotalCents - totalDiscountCents),
      discountAmountCents: totalDiscountCents,
    };
  }

  // appliesTo === 'order' — apply to the order subtotal as a whole.
  return computeOrderDiscount(discount, baseTotalCents);
}

function computePerSlotDiscount(
  discount: Discount,
  unitPriceCents: number
): number {
  switch (discount.type) {
    case 'percent':
      return Math.round(unitPriceCents * (discount.percent / 100));
    case 'amount':
    case 'amount-before-date':
      return Math.min(discount.amountCents, unitPriceCents);
  }
}

function computeOrderDiscount(
  discount: Discount,
  totalCents: number
): DiscountApplicationResult {
  switch (discount.type) {
    case 'percent': {
      const discountAmountCents = Math.round(
        totalCents * (discount.percent / 100)
      );
      return {
        updatedCents: Math.max(0, totalCents - discountAmountCents),
        discountAmountCents,
      };
    }
    case 'amount':
    case 'amount-before-date': {
      const discountAmountCents = Math.min(discount.amountCents, totalCents);
      return {
        updatedCents: Math.max(0, totalCents - discountAmountCents),
        discountAmountCents,
      };
    }
  }
}

/**
 * Check if a discount is currently valid: active, not past its global
 * expiry, and has remaining usage allowance. For amount-before-date,
 * also checks the type-specific cutoff date.
 *
 * Note: this is the read-time check used by lookup/calculate. The
 * authoritative usage check happens transactionally inside
 * `create-registration` when the redemption is reserved.
 *
 * @param discount The discount to check
 * @param now Optional current time (for testing)
 */
export function isDiscountValid(
  discount: Discount,
  now: Date = new Date()
): boolean {
  if (discount.status !== 'active') {
    return false;
  }
  if (discount.expiresAt) {
    const expires =
      discount.expiresAt instanceof Date
        ? discount.expiresAt
        : new Date(discount.expiresAt);
    if (now > expires) return false;
  }
  if (
    discount.usageLimit !== null &&
    discount.usageCount >= discount.usageLimit
  ) {
    return false;
  }
  if (discount.type === 'amount-before-date') {
    const cutoff =
      discount.cutoffDate instanceof Date
        ? discount.cutoffDate
        : new Date(discount.cutoffDate);
    return now <= cutoff;
  }
  return true;
}

/**
 * Format a discount for display (e.g., "10% off", "$5.00 off (slots 2+)")
 */
export function formatDiscount(discount: Discount): string {
  const suffix =
    discount.appliesTo === 'nth-slot-onward'
      ? ` (slots ${discount.nthSlot}+)`
      : '';
  switch (discount.type) {
    case 'percent':
      return `${discount.percent}% off${suffix}`;
    case 'amount':
      return `$${(discount.amountCents / 100).toFixed(2)} off${suffix}`;
    case 'amount-before-date': {
      const cutoff =
        discount.cutoffDate instanceof Date
          ? discount.cutoffDate
          : new Date(discount.cutoffDate);
      return `$${(discount.amountCents / 100).toFixed(2)} off${suffix} (before ${cutoff.toLocaleDateString()})`;
    }
  }
}
