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
 * Apply a discount to a total amount.
 *
 * Ensures the result is never negative (minimum $0).
 * For amount-before-date discounts, checks the cutoff date
 * against the current time.
 *
 * @param discount The discount to apply
 * @param totalCents The total in cents before discount
 * @param now Optional current time (for testing)
 */
export function applyDiscount(
  discount: Discount,
  totalCents: number,
  now: Date = new Date()
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
    case 'amount': {
      const discountAmountCents = Math.min(discount.amountCents, totalCents);
      return {
        updatedCents: Math.max(0, totalCents - discount.amountCents),
        discountAmountCents,
      };
    }
    case 'amount-before-date': {
      const cutoff =
        discount.cutoffDate instanceof Date
          ? discount.cutoffDate
          : new Date(discount.cutoffDate);
      if (now <= cutoff) {
        const discountAmountCents = Math.min(
          discount.amountCents,
          totalCents
        );
        return {
          updatedCents: Math.max(0, totalCents - discount.amountCents),
          discountAmountCents,
        };
      }
      // Past cutoff date — no discount
      return {
        updatedCents: totalCents,
        discountAmountCents: 0,
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
 * Format a discount for display (e.g., "10% off", "$5.00 off")
 */
export function formatDiscount(discount: Discount): string {
  switch (discount.type) {
    case 'percent':
      return `${discount.percent}% off`;
    case 'amount':
      return `$${(discount.amountCents / 100).toFixed(2)} off`;
    case 'amount-before-date': {
      const cutoff =
        discount.cutoffDate instanceof Date
          ? discount.cutoffDate
          : new Date(discount.cutoffDate);
      return `$${(discount.amountCents / 100).toFixed(2)} off (before ${cutoff.toLocaleDateString()})`;
    }
  }
}
