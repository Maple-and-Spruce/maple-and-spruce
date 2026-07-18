/**
 * Mock Etsy listings for storybook interaction tests.
 *
 * Types mirror the EtsyListing shape from the Etsy v3 API (only the
 * fields the import UI reads).
 */
import type { EtsyListingWithSyncInfo } from '@maple/ts/firebase/api-types';

type MockListingOverrides = {
  listing_id: number;
  title?: string;
  priceCents?: number;
  quantity?: number;
  imageUrl?: string;
  variantCount?: number;
};

function makeMockListing(
  over: MockListingOverrides,
  syncOverrides: Partial<EtsyListingWithSyncInfo> = {}
): EtsyListingWithSyncInfo {
  const variantCount = over.variantCount ?? 1;
  const priceCents = over.priceCents ?? 2500;

  const listing = {
    listing_id: over.listing_id,
    user_id: 1,
    shop_id: 2,
    title: over.title ?? `Listing ${over.listing_id}`,
    description: 'A mock description',
    state: 'active',
    creation_timestamp: 0,
    created_timestamp: 0,
    ending_timestamp: 0,
    original_creation_timestamp: 0,
    last_modified_timestamp: 0,
    updated_timestamp: 0,
    state_timestamp: 0,
    quantity: over.quantity ?? 3,
    shop_section_id: null,
    featured_rank: -1,
    url: `https://www.etsy.com/listing/${over.listing_id}`,
    num_favorers: 0,
    non_taxable: false,
    is_taxable: true,
    is_customizable: false,
    is_personalizable: false,
    is_supply: false,
    listing_type: 'physical',
    tags: ['handmade'],
    materials: [],
    shipping_profile_id: 1,
    return_policy_id: null,
    processing_min: null,
    processing_max: null,
    who_made: 'i_did',
    when_made: '2020_2025',
    item_weight: null,
    item_weight_unit: null,
    item_length: null,
    item_width: null,
    item_height: null,
    item_dimensions_unit: null,
    taxonomy_id: 68,
    price: { amount: priceCents, divisor: 100, currency_code: 'USD' },
    views: 0,
    images: over.imageUrl
      ? [
          {
            listing_image_id: over.listing_id * 10,
            listing_id: over.listing_id,
            hex_code: null,
            red: null,
            green: null,
            blue: null,
            hue: null,
            saturation: null,
            brightness: null,
            is_black_and_white: null,
            creation_tsz: 0,
            created_timestamp: 0,
            rank: 1,
            url_75x75: over.imageUrl,
            url_170x135: over.imageUrl,
            url_570xN: over.imageUrl,
            url_fullxfull: over.imageUrl,
            full_height: 500,
            full_width: 500,
            alt_text: null,
          },
        ]
      : [],
    inventory: {
      products: Array.from({ length: variantCount }, (_, i) => ({
        product_id: over.listing_id * 10 + i,
        sku: `sku-${over.listing_id}-${i}`,
        is_deleted: false,
        offerings: [],
        property_values: [],
      })),
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    },
  } as unknown as EtsyListingWithSyncInfo['listing'];

  return {
    listing,
    imported: syncOverrides.imported ?? false,
    productId: syncOverrides.productId,
    variantCount,
    isSimple: variantCount <= 1,
  };
}

export const mockEtsyListingAvailable = makeMockListing({
  listing_id: 101,
  title: 'Handmade Pottery Mug',
  priceCents: 2500,
  quantity: 3,
});

export const mockEtsyListingImported = makeMockListing(
  {
    listing_id: 102,
    title: 'Already Imported Scarf',
    priceCents: 4500,
    quantity: 1,
  },
  { imported: true, productId: 'prod-existing' }
);

export const mockEtsyListingMultiVariant = makeMockListing({
  listing_id: 103,
  title: 'Multi-Variant Earrings',
  priceCents: 3500,
  quantity: 8,
  variantCount: 3,
});

export const mockEtsyListingWithImage = makeMockListing({
  listing_id: 104,
  title: 'Wool Cardigan',
  priceCents: 8500,
  quantity: 1,
  imageUrl: 'https://placehold.co/600x600?text=Etsy',
});

export const mockEtsyListings: EtsyListingWithSyncInfo[] = [
  mockEtsyListingAvailable,
  mockEtsyListingImported,
  mockEtsyListingMultiVariant,
  mockEtsyListingWithImage,
];
