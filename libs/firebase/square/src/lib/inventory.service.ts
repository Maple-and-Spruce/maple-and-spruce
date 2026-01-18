/**
 * Square Inventory API service
 *
 * Handles inventory quantity tracking in Square.
 * Inventory is tracked per CatalogItemVariation at a specific Location.
 *
 * @see https://developer.squareup.com/docs/inventory-api/what-it-does
 */
import { SquareClient, Square } from 'square';

/**
 * Input for setting inventory quantity
 */
export interface SetInventoryInput {
  /** Square item variation ID */
  squareVariationId: string;
  /** Square location ID */
  locationId: string;
  /** New quantity */
  quantity: number;
}

/**
 * Input for adjusting inventory quantity
 */
export interface AdjustInventoryInput {
  /** Square item variation ID */
  squareVariationId: string;
  /** Square location ID */
  locationId: string;
  /** Quantity change (positive to add, negative to remove) */
  quantityChange: number;
  /** Reason for adjustment */
  reason?: string;
}

/**
 * Inventory count result
 */
export interface InventoryCountResult {
  /** Square item variation ID */
  squareVariationId: string;
  /** Square location ID */
  locationId: string;
  /** Current quantity */
  quantity: number;
  /** State (IN_STOCK, SOLD, etc.) */
  state: string;
}

/**
 * Inventory service for Square API operations
 */
export class InventoryService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Get the default location ID
   *
   * For single-location businesses, this returns the main location.
   * Square requires a location ID for all inventory operations.
   */
  async getDefaultLocationId(): Promise<string> {
    const response = await this.client.locations.list();
    const locations = response.locations || [];

    if (locations.length === 0) {
      throw new Error('No Square locations found. Please set up a location in Square Dashboard.');
    }

    // Prefer the main location, otherwise use the first one
    const mainLocation = locations.find((loc: Square.Location) => loc.status === 'ACTIVE');
    return mainLocation?.id || locations[0].id!;
  }

  /**
   * Set inventory quantity for a catalog item variation
   *
   * This performs a physical count adjustment, setting the quantity
   * to an absolute value.
   */
  async setQuantity(input: SetInventoryInput): Promise<void> {
    const idempotencyKey = `set-${input.squareVariationId}-${input.locationId}-${Date.now()}`;

    await this.client.inventory.batchCreateChanges({
      idempotencyKey,
      changes: [
        {
          type: 'PHYSICAL_COUNT',
          physicalCount: {
            catalogObjectId: input.squareVariationId,
            locationId: input.locationId,
            quantity: String(input.quantity),
            state: 'IN_STOCK',
            occurredAt: new Date().toISOString(),
          },
        },
      ],
    });
  }

  /**
   * Adjust inventory quantity by a delta
   *
   * Use positive numbers to add inventory, negative to remove.
   */
  async adjustQuantity(input: AdjustInventoryInput): Promise<void> {
    if (input.quantityChange === 0) {
      return;
    }

    const idempotencyKey = `adjust-${input.squareVariationId}-${input.locationId}-${Date.now()}`;

    await this.client.inventory.batchCreateChanges({
      idempotencyKey,
      changes: [
        {
          type: 'ADJUSTMENT',
          adjustment: {
            catalogObjectId: input.squareVariationId,
            locationId: input.locationId,
            quantity: String(Math.abs(input.quantityChange)),
            fromState: input.quantityChange > 0 ? 'NONE' : 'IN_STOCK',
            toState: input.quantityChange > 0 ? 'IN_STOCK' : 'SOLD',
            occurredAt: new Date().toISOString(),
          },
        },
      ],
    });
  }

  /**
   * Get current inventory count for a catalog item variation
   */
  async getCount(
    squareVariationId: string,
    locationId: string
  ): Promise<InventoryCountResult | null> {
    // batchGetCounts returns a Page, use .data to get the items
    const page = await this.client.inventory.batchGetCounts({
      catalogObjectIds: [squareVariationId],
      locationIds: [locationId],
    });

    const counts: Square.InventoryCount[] = page.data || [];
    const count = counts.find(
      (c: Square.InventoryCount) =>
        c.catalogObjectId === squareVariationId &&
        c.locationId === locationId &&
        c.state === 'IN_STOCK'
    );

    if (!count) {
      return null;
    }

    return {
      squareVariationId: count.catalogObjectId!,
      locationId: count.locationId!,
      quantity: parseInt(count.quantity || '0', 10),
      state: count.state || 'NONE',
    };
  }

  /**
   * Get inventory counts for multiple catalog item variations
   */
  async getCounts(
    squareVariationIds: string[],
    locationId: string
  ): Promise<InventoryCountResult[]> {
    if (squareVariationIds.length === 0) {
      return [];
    }

    const page = await this.client.inventory.batchGetCounts({
      catalogObjectIds: squareVariationIds,
      locationIds: [locationId],
    });

    const counts: Square.InventoryCount[] = page.data || [];

    return counts
      .filter((c: Square.InventoryCount) => c.state === 'IN_STOCK')
      .map((c: Square.InventoryCount) => ({
        squareVariationId: c.catalogObjectId!,
        locationId: c.locationId!,
        quantity: parseInt(c.quantity || '0', 10),
        state: c.state || 'NONE',
      }));
  }

  /**
   * Record a sale (decrease inventory)
   *
   * This is typically called from a Square webhook when a sale occurs.
   */
  async recordSale(
    squareVariationId: string,
    locationId: string,
    quantity: number = 1
  ): Promise<void> {
    await this.adjustQuantity({
      squareVariationId,
      locationId,
      quantityChange: -quantity,
      reason: 'Sale',
    });
  }
}
