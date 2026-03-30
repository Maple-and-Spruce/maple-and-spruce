/**
 * Etsy Inventory Service
 *
 * Manages listing inventory (quantity and pricing).
 *
 * CRITICAL: Etsy's updateInventory endpoint is a FULL REPLACEMENT.
 * You must GET the current inventory, strip server-only fields,
 * modify what you need, and PUT the entire products array back.
 *
 * Server-only fields to strip:
 * - product_id (from products)
 * - offering_id (from offerings)
 * - is_deleted (from products and offerings)
 * - scale_name (from property_values)
 * - value_pairs (from property_values, if present)
 *
 * Price format conversion:
 * - GET returns: { amount: 2500, divisor: 100, currency_code: "USD" }
 * - PUT expects: decimal float (e.g., 25.00)
 *
 * @see https://developers.etsy.com/documentation/reference/
 */
import type { EtsyHttp } from '../http/etsy-http.js';
import type { EtsyListingInventory } from '../types/listing.types.js';
import type {
  UpdateInventoryInput,
  UpdateInventoryProduct,
  UpdateInventoryOffering,
  UpdateInventoryPropertyValue,
} from '../types/inventory.types.js';

export class InventoryService {
  constructor(private readonly http: EtsyHttp) {}

  /**
   * Get the current inventory for a listing.
   *
   * @param listingId - Etsy listing ID
   * @returns Current inventory including products, offerings, and variations
   */
  async getInventory(listingId: number): Promise<EtsyListingInventory> {
    return this.http.get<EtsyListingInventory>(
      `/listings/${listingId}/inventory`
    );
  }

  /**
   * Update inventory for a listing (full replacement).
   *
   * @param listingId - Etsy listing ID
   * @param input - Complete inventory payload (server fields must be stripped)
   * @returns Updated inventory
   */
  async updateInventory(
    listingId: number,
    input: UpdateInventoryInput
  ): Promise<EtsyListingInventory> {
    return this.http.put<EtsyListingInventory>(
      `/listings/${listingId}/inventory`,
      input as unknown as Record<string, unknown>
    );
  }

  /**
   * Convenience method: update just the quantity for a simple listing
   * (no variations).
   *
   * Handles the full GET → strip → modify → PUT cycle automatically.
   *
   * @param listingId - Etsy listing ID
   * @param quantity - New quantity
   * @returns Updated inventory
   */
  async setQuantity(
    listingId: number,
    quantity: number
  ): Promise<EtsyListingInventory> {
    const current = await this.getInventory(listingId);
    const cleaned = this.stripServerFields(current);

    // Update quantity on all offerings
    for (const product of cleaned.products) {
      for (const offering of product.offerings) {
        offering.quantity = quantity;
      }
    }

    return this.updateInventory(listingId, cleaned);
  }

  /**
   * Strip server-only fields from an inventory response to prepare
   * it for a PUT update request.
   *
   * This handles the critical gotcha of Etsy's full-replacement API:
   * server-generated fields cause 400 errors if included in updates.
   */
  stripServerFields(inventory: EtsyListingInventory): UpdateInventoryInput {
    const products: UpdateInventoryProduct[] = inventory.products
      .filter((p) => !p.is_deleted)
      .map((product) => ({
        sku: product.sku,
        offerings: product.offerings
          .filter((o) => !o.is_deleted)
          .map(
            (offering): UpdateInventoryOffering => ({
              price: offering.price.amount / offering.price.divisor,
              quantity: offering.quantity,
              is_enabled: offering.is_enabled,
            })
          ),
        property_values: product.property_values.map(
          (pv): UpdateInventoryPropertyValue => ({
            property_id: pv.property_id,
            property_name: pv.property_name,
            value_ids: pv.value_ids,
            values: pv.values,
          })
        ),
      }));

    return {
      products,
      price_on_property: inventory.price_on_property,
      quantity_on_property: inventory.quantity_on_property,
      sku_on_property: inventory.sku_on_property,
    };
  }
}
