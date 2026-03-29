/**
 * Etsy Listing API types
 *
 * Types for the ShopListing endpoints of the Etsy Open API v3.
 *
 * @see https://developers.etsy.com/documentation/reference/
 */
import type {
  EtsyMoney,
  EtsyWhoMade,
  EtsyWhenMade,
  EtsyListingState,
  EtsyWeightUnit,
  EtsyDimensionUnit,
} from './common.types.js';

/**
 * Etsy listing as returned by the API.
 */
export interface EtsyListing {
  listing_id: number;
  user_id: number;
  shop_id: number;
  title: string;
  description: string;
  state: EtsyListingState;
  creation_timestamp: number;
  created_timestamp: number;
  ending_timestamp: number;
  original_creation_timestamp: number;
  last_modified_timestamp: number;
  updated_timestamp: number;
  state_timestamp: number;
  quantity: number;
  shop_section_id: number | null;
  featured_rank: number;
  url: string;
  num_favorers: number;
  non_taxable: boolean;
  is_taxable: boolean;
  is_customizable: boolean;
  is_personalizable: boolean;
  is_supply: boolean;
  listing_type: string;
  tags: string[];
  materials: string[];
  shipping_profile_id: number;
  return_policy_id: number | null;
  processing_min: number | null;
  processing_max: number | null;
  who_made: EtsyWhoMade;
  when_made: EtsyWhenMade;
  item_weight: number | null;
  item_weight_unit: EtsyWeightUnit | null;
  item_length: number | null;
  item_width: number | null;
  item_height: number | null;
  item_dimensions_unit: EtsyDimensionUnit | null;
  taxonomy_id: number;
  price: EtsyMoney;
  views: number;
  /** Included when requesting with includes=Images */
  images?: EtsyListingImage[];
  /** Included when requesting with includes=Inventory */
  inventory?: EtsyListingInventory;
}

/** Etsy listing image */
export interface EtsyListingImage {
  listing_image_id: number;
  listing_id: number;
  hex_code: string | null;
  red: number | null;
  green: number | null;
  blue: number | null;
  hue: number | null;
  saturation: number | null;
  brightness: number | null;
  is_black_and_white: boolean | null;
  creation_tsz: number;
  created_timestamp: number;
  rank: number;
  url_75x75: string;
  url_170x135: string;
  url_570xN: string;
  url_fullxfull: string;
  full_height: number;
  full_width: number;
  alt_text: string | null;
}

/**
 * Input for creating a draft listing.
 *
 * Only includes fields relevant to Maple & Spruce's use case.
 * Additional fields (personalization, production partners, etc.)
 * can be added as needed.
 */
export interface CreateDraftListingInput {
  /** Listing title (max 140 characters) */
  title: string;
  /** Listing description */
  description: string;
  /** Price as a float (e.g., 25.00) */
  price: number;
  /** Initial quantity */
  quantity: number;
  /** Taxonomy category ID */
  taxonomy_id: number;
  /** Who made the item */
  who_made: EtsyWhoMade;
  /** When the item was made */
  when_made: EtsyWhenMade;
  /** Whether the item is a supply or tool */
  is_supply?: boolean;
  /** Shipping profile ID (required for physical items) */
  shipping_profile_id?: number;
  /** Shop section ID for organization */
  shop_section_id?: number;
  /** Tags for search (max 13) */
  tags?: string[];
  /** Materials used */
  materials?: string[];
  /** Return policy ID */
  return_policy_id?: number;
  /** Minimum processing days */
  processing_min?: number;
  /** Maximum processing days */
  processing_max?: number;
}

/**
 * Input for updating an existing listing.
 *
 * All fields are optional — only include fields to change.
 */
export interface UpdateListingInput {
  title?: string;
  description?: string;
  price?: number;
  quantity?: number;
  taxonomy_id?: number;
  who_made?: EtsyWhoMade;
  when_made?: EtsyWhenMade;
  is_supply?: boolean;
  shipping_profile_id?: number;
  shop_section_id?: number;
  tags?: string[];
  materials?: string[];
  /** Set to 'active' to publish a draft, or 'draft' to unpublish */
  state?: 'active' | 'draft';
  return_policy_id?: number;
  processing_min?: number;
  processing_max?: number;
}

/**
 * Etsy listing inventory (included via ?includes=Inventory).
 */
export interface EtsyListingInventory {
  products: EtsyInventoryProduct[];
  price_on_property: number[];
  quantity_on_property: number[];
  sku_on_property: number[];
}

/** A product within a listing's inventory */
export interface EtsyInventoryProduct {
  product_id: number;
  sku: string;
  is_deleted: boolean;
  offerings: EtsyInventoryOffering[];
  property_values: EtsyPropertyValue[];
}

/** An offering within an inventory product */
export interface EtsyInventoryOffering {
  offering_id: number;
  quantity: number;
  is_enabled: boolean;
  is_deleted: boolean;
  price: EtsyMoney;
}

/** A property value for product variations */
export interface EtsyPropertyValue {
  property_id: number;
  property_name: string;
  scale_id: number | null;
  scale_name: string | null;
  value_ids: number[];
  values: string[];
}
