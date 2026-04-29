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
 * Input for updating a discount
 * All fields optional except id; type cannot be changed
 */
export type UpdateDiscountInput = {
  id: string;
  code?: string;
  description?: string;
  status?: DiscountStatus;
  appliesTo?: DiscountAppliesTo;
  nthSlot?: number;
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
 * Check if a discount is currently valid (active and not expired).
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
