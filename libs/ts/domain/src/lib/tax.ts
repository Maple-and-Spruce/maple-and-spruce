/**
 * Tax calculation utilities
 *
 * Pure functions for computing sales tax on registration and retail transactions.
 */

/**
 * Result of a tax calculation
 */
export interface TaxCalculationResult {
  /** Tax amount in cents */
  taxAmountCents: number;
  /** Total amount (subtotal + tax) in cents */
  totalCents: number;
}

/**
 * Calculate sales tax on a subtotal amount.
 *
 * @param subtotalCents - The pre-tax amount in cents
 * @param taxRatePercent - The tax rate as a percentage (e.g., 6.0 for 6%)
 * @returns Tax amount and total (subtotal + tax) in cents
 */
export function calculateTax(
  subtotalCents: number,
  taxRatePercent: number
): TaxCalculationResult {
  const taxAmountCents = Math.round(subtotalCents * (taxRatePercent / 100));
  return {
    taxAmountCents,
    totalCents: subtotalCents + taxAmountCents,
  };
}
