/**
 * InventoryMovement domain types
 *
 * Immutable audit log of all inventory changes.
 * Enables reconciliation and historical tracking.
 */

export interface InventoryMovement {
  id: string;
  productId: string;

  type: InventoryMovementType;
  /** Change in quantity (+/- delta) */
  quantityChange: number;
  /** Quantity before this change (snapshot for audit) */
  quantityBefore: number;
  /** Quantity after this change (enables reconciliation) */
  quantityAfter: number;

  source: InventorySource;
  /** External reference (e.g., order ID, receipt ID) */
  sourceReference?: string;
  /** Link to Sale record if type is 'sale' */
  saleId?: string;

  notes?: string;
  /** User ID who performed the change, or 'system' */
  performedBy?: string;

  createdAt: Date;
}

export type InventoryMovementType =
  | 'sale' // Sold (decreases quantity)
  | 'return' // Returned (increases quantity)
  | 'restock' // Restocked by artist (increases quantity)
  | 'adjustment' // Manual correction (+/-)
  | 'damaged' // Write-off (decreases quantity)
  | 'initial'; // Initial stock entry

export type InventorySource =
  | 'manual' // Admin entered in inventory app
  | 'etsy' // From Etsy webhook/sync
  | 'square' // From Square POS
  | 'system'; // Automated (reconciliation, etc.)

/**
 * Input for creating an inventory movement
 */
export type CreateInventoryMovementInput = Omit<
  InventoryMovement,
  'id' | 'createdAt'
>;

/**
 * Validate that an inventory movement would result in valid quantity
 */
export function validateInventoryMovement(
  currentQuantity: number,
  change: number
): { valid: boolean; resultingQuantity: number; error?: string } {
  const resultingQuantity = currentQuantity + change;

  if (resultingQuantity < 0) {
    return {
      valid: false,
      resultingQuantity,
      error: `Cannot reduce quantity below 0. Current: ${currentQuantity}, Change: ${change}`,
    };
  }

  return { valid: true, resultingQuantity };
}

/**
 * Calculate expected quantity from movement history
 * Used for reconciliation checks
 */
export function calculateQuantityFromMovements(
  movements: Pick<InventoryMovement, 'quantityChange'>[]
): number {
  return movements.reduce((sum, m) => sum + m.quantityChange, 0);
}
