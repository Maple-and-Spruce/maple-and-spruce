/**
 * Etsy Inventory API types
 *
 * Types for inventory management endpoints.
 * The updateInventory endpoint is a full replacement — the entire products
 * array must be sent, with server-only fields stripped.
 *
 * @see https://developers.etsy.com/documentation/reference/
 */

/**
 * Input for updating inventory.
 *
 * This is the cleaned payload sent to PUT /listings/{id}/inventory.
 * Server-only fields (product_id, offering_id, is_deleted, scale_name,
 * value_pairs) must be stripped from the GET response before sending.
 */
export interface UpdateInventoryInput {
  products: UpdateInventoryProduct[];
  price_on_property?: number[];
  quantity_on_property?: number[];
  sku_on_property?: number[];
}

/** Product in an inventory update payload (server fields stripped) */
export interface UpdateInventoryProduct {
  sku: string;
  offerings: UpdateInventoryOffering[];
  property_values?: UpdateInventoryPropertyValue[];
}

/** Offering in an inventory update payload (server fields stripped) */
export interface UpdateInventoryOffering {
  /** Price as a decimal float (e.g., 25.00), NOT the {amount, divisor} format */
  price: number;
  quantity: number;
  is_enabled: boolean;
}

/** Property value in an inventory update payload (server fields stripped) */
export interface UpdateInventoryPropertyValue {
  property_id: number;
  property_name: string;
  value_ids: number[];
  values: string[];
}
