/**
 * Shared in-memory fixture store for Etsy listings.
 *
 * Tests seed listings via setListings() / addListing() and the routes
 * read from this store. Built this way so both `/listings/:id` and
 * `/shops/:shopId/listings` see the same data.
 */

export interface MockListingSeed {
  listing_id: number;
  title: string;
  description: string;
  state: 'active' | 'inactive' | 'sold_out' | 'draft' | 'expired';
  priceAmount: number; // in the smallest currency unit multiplied by divisor
  priceDivisor: number;
  currency: string;
  quantity: number;
  taxonomy_id: number;
  tags?: string[];
  materials?: string[];
  who_made?: 'i_did' | 'someone_else' | 'collective';
  when_made?: string;
  url?: string;
  imageUrls?: string[];
  /** Per-product SKUs. Length > 1 simulates a multi-variant listing. */
  productSkus?: string[];
}

let listings: MockListingSeed[] = [];

export function clearListings(): void {
  listings = [];
}

export function setListings(seeds: MockListingSeed[]): void {
  listings = [...seeds];
}

export function addListing(seed: MockListingSeed): void {
  listings = [...listings.filter((l) => l.listing_id !== seed.listing_id), seed];
}

export function getListings(): MockListingSeed[] {
  return [...listings];
}

export function getListingById(id: number): MockListingSeed | undefined {
  return listings.find((l) => l.listing_id === id);
}

/**
 * Build a listing seed with sensible defaults. Override only what matters.
 */
export function makeListing(
  overrides: Partial<MockListingSeed> & { listing_id: number }
): MockListingSeed {
  return {
    title: `Listing ${overrides.listing_id}`,
    description: 'Mock listing description',
    state: 'active',
    priceAmount: 2500,
    priceDivisor: 100,
    currency: 'USD',
    quantity: 3,
    taxonomy_id: 68,
    tags: ['handmade'],
    materials: ['wood'],
    who_made: 'i_did',
    when_made: '2020_2025',
    url: `https://www.etsy.com/listing/${overrides.listing_id}`,
    imageUrls: [],
    productSkus: [`sku-${overrides.listing_id}`],
    ...overrides,
  };
}

/**
 * Render a seed as the full Etsy v3 listing JSON shape (the subset our
 * code reads). Includes images + inventory.
 */
export function seedToEtsyListing(seed: MockListingSeed): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const products = (seed.productSkus ?? [`sku-${seed.listing_id}`]).map(
    (sku, idx) => ({
      product_id: seed.listing_id * 10 + idx,
      sku,
      is_deleted: false,
      offerings: [
        {
          offering_id: seed.listing_id * 100 + idx,
          quantity: seed.quantity,
          is_enabled: true,
          is_deleted: false,
          price: {
            amount: seed.priceAmount,
            divisor: seed.priceDivisor,
            currency_code: seed.currency,
          },
        },
      ],
      property_values: [],
    })
  );

  return {
    listing_id: seed.listing_id,
    user_id: 11111,
    shop_id: 22222,
    title: seed.title,
    description: seed.description,
    state: seed.state,
    creation_timestamp: now,
    created_timestamp: now,
    ending_timestamp: now + 90 * 86400,
    original_creation_timestamp: now,
    last_modified_timestamp: now,
    updated_timestamp: now,
    state_timestamp: now,
    quantity: seed.quantity,
    shop_section_id: null,
    featured_rank: -1,
    url: seed.url ?? `https://www.etsy.com/listing/${seed.listing_id}`,
    num_favorers: 0,
    non_taxable: false,
    is_taxable: true,
    is_customizable: false,
    is_personalizable: false,
    is_supply: false,
    listing_type: 'physical',
    tags: seed.tags ?? [],
    materials: seed.materials ?? [],
    shipping_profile_id: 777,
    return_policy_id: null,
    processing_min: null,
    processing_max: null,
    who_made: seed.who_made ?? 'i_did',
    when_made: seed.when_made ?? '2020_2025',
    item_weight: null,
    item_weight_unit: null,
    item_length: null,
    item_width: null,
    item_height: null,
    item_dimensions_unit: null,
    taxonomy_id: seed.taxonomy_id,
    price: {
      amount: seed.priceAmount,
      divisor: seed.priceDivisor,
      currency_code: seed.currency,
    },
    views: 0,
    images: (seed.imageUrls ?? []).map((url, idx) => ({
      listing_image_id: seed.listing_id * 1000 + idx,
      listing_id: seed.listing_id,
      hex_code: null,
      red: null,
      green: null,
      blue: null,
      hue: null,
      saturation: null,
      brightness: null,
      is_black_and_white: null,
      creation_tsz: now,
      created_timestamp: now,
      rank: idx + 1,
      url_75x75: url,
      url_170x135: url,
      url_570xN: url,
      url_fullxfull: url,
      full_height: 1000,
      full_width: 1000,
      alt_text: null,
    })),
    inventory: {
      products,
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    },
  };
}
