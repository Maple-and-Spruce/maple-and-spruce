/**
 * Push Product to Etsy Cloud Function
 *
 * Creates a native Etsy listing from an existing Firestore Product.
 * Handles the full flow: create draft listing, upload image, set
 * variant inventory, and optionally activate the listing.
 *
 * Admin only. Lives in the maple-sync codebase (Etsy API dependency).
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  FirestoreTokenStorage,
  ProductRepository,
  EtsyTemplateRepository,
} from '@maple/firebase/database';
import {
  EtsyClient,
  type CreateDraftListingInput,
  type EtsyWhoMade,
  type EtsyWhenMade,
} from '@maple/firebase/etsy';
import { mergeEtsyTemplates, getTotalQuantity } from '@maple/ts/domain';
import type { Product, ProductVariant } from '@maple/ts/domain';
import type {
  PushProductToEtsyRequest,
  PushProductToEtsyResponse,
} from '@maple/ts/firebase/api-types';
import type {
  UpdateInventoryProduct,
  UpdateInventoryOffering,
  UpdateInventoryPropertyValue,
} from '@maple/firebase/etsy';

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

/**
 * Download an image URL and return it as a Buffer with content type.
 * Returns undefined on failure (best-effort).
 */
async function downloadImage(
  imageUrl: string
): Promise<{ buffer: Buffer; contentType: string } | undefined> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(
        `Failed to download image (${response.status}): ${imageUrl}`
      );
      return undefined;
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch (err) {
    console.warn('Failed to download image:', err);
    return undefined;
  }
}

/**
 * Build the Etsy inventory products array for multi-variant listings.
 *
 * Each ProductVariant becomes an Etsy inventory product with its own
 * price, quantity, and property values. The variant label is used as
 * the property value (e.g. "Small", "Large").
 */
function buildInventoryProducts(
  variants: ProductVariant[],
  variantProperties?: string[]
): {
  products: UpdateInventoryProduct[];
  priceOnProperty: number[];
  quantityOnProperty: number[];
  skuOnProperty: number[];
} {
  // Etsy property IDs: 513 = "Primary color", 514 = "Secondary color",
  // 100 = custom property 1, 200 = custom property 2.
  // Using 100 for the first variant dimension.
  const propertyId = 100;
  const propertyName = variantProperties?.[0] ?? 'Variation';

  const products: UpdateInventoryProduct[] = variants.map((v) => ({
    sku: v.sku,
    offerings: [
      {
        price: v.priceCents / 100,
        quantity: v.quantity,
        is_enabled: true,
      } as UpdateInventoryOffering,
    ],
    property_values: [
      {
        property_id: propertyId,
        property_name: propertyName,
        value_ids: [0],
        values: [v.label],
      } as UpdateInventoryPropertyValue,
    ],
  }));

  return {
    products,
    priceOnProperty: [propertyId],
    quantityOnProperty: [propertyId],
    skuOnProperty: [propertyId],
  };
}

export const pushProductToEtsy = Functions.endpoint
  .usingSecrets(...ETSY_SECRET_NAMES)
  .usingStrings(...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<PushProductToEtsyRequest, PushProductToEtsyResponse>(
    async (data, _context, secrets, strings) => {
      const { productId, activateAfterPush } = data;

      if (!productId) {
        return { success: false, error: 'productId is required' };
      }

      // 1. Fetch product from Firestore
      const product = await ProductRepository.findById(productId);
      if (!product) {
        return { success: false, error: `Product ${productId} not found` };
      }

      // 2. Validate: must have variants, must not already be on Etsy
      if (!product.variants || product.variants.length === 0) {
        return {
          success: false,
          error: 'Product must have at least one variant',
        };
      }
      if (product.etsyListingId) {
        return {
          success: false,
          error: `Product is already linked to Etsy listing ${product.etsyListingId}`,
        };
      }

      // 3. Resolve Etsy template defaults
      const [categoryTemplate, artistTemplate] = await Promise.all([
        product.categoryId
          ? EtsyTemplateRepository.getCategoryTemplate(product.categoryId)
          : Promise.resolve(undefined),
        product.artistId
          ? EtsyTemplateRepository.getArtistTemplate(product.artistId)
          : Promise.resolve(undefined),
      ]);

      const defaults = mergeEtsyTemplates(categoryTemplate, artistTemplate);

      // 4. Map Product -> CreateDraftListingInput
      const firstVariant = product.variants[0];
      const totalQuantity = getTotalQuantity(product);

      if (!defaults.taxonomyId) {
        return {
          success: false,
          error:
            'No taxonomy_id available. Set a category or artist Etsy template with a taxonomy ID before pushing.',
        };
      }

      const listingInput: CreateDraftListingInput = {
        title: (product.squareCache.name ?? '').substring(0, 140),
        description: product.squareCache.description ?? '',
        price: firstVariant.priceCents / 100,
        quantity: totalQuantity,
        taxonomy_id: defaults.taxonomyId,
        who_made: (defaults.whoMade as EtsyWhoMade) ?? 'someone_else',
        when_made: (defaults.whenMade as EtsyWhenMade) ?? 'made_to_order',
        is_supply: defaults.isSupply ?? false,
        shipping_profile_id: defaults.shippingProfileId,
        shop_section_id: defaults.shopSectionId,
        tags: defaults.tags,
        materials: defaults.materials,
      };

      // 5. Create the Etsy client and push the listing
      const client = new EtsyClient({
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        tokenStorage: FirestoreTokenStorage,
        redirectUri: strings.ETSY_REDIRECT_URI,
      });

      const listing = await client.listings.createDraftListing(listingInput);
      const etsyListingId = String(listing.listing_id);

      // 6. Upload image if available (best-effort)
      const imageUrl = product.squareCache.imageUrl;
      if (imageUrl) {
        const downloaded = await downloadImage(imageUrl);
        if (downloaded) {
          try {
            const ext =
              downloaded.contentType.split('/')[1]?.split(';')[0] ?? 'jpg';
            await client.listings.uploadListingImage(
              listing.listing_id,
              downloaded.buffer,
              `product.${ext}`,
              downloaded.contentType
            );
          } catch (err) {
            console.warn('Failed to upload image to Etsy:', err);
          }
        }
      }

      // 7. Set variant inventory for multi-variant products
      const isMultiVariant = product.variants.length > 1;
      let variantEtsyProductIds: Map<string, number> | undefined;

      if (isMultiVariant) {
        try {
          const inventoryData = buildInventoryProducts(
            product.variants,
            product.variantProperties
          );

          const updatedInventory = await client.inventory.updateInventory(
            listing.listing_id,
            {
              products: inventoryData.products,
              price_on_property: inventoryData.priceOnProperty,
              quantity_on_property: inventoryData.quantityOnProperty,
              sku_on_property: inventoryData.skuOnProperty,
            }
          );

          // Map Etsy product_ids back to our variant IDs by SKU match
          variantEtsyProductIds = new Map<string, number>();
          for (const etsyProduct of updatedInventory.products) {
            const matchingVariant = product.variants.find(
              (v) => v.sku === etsyProduct.sku
            );
            if (matchingVariant) {
              variantEtsyProductIds.set(
                matchingVariant.id,
                etsyProduct.product_id
              );
            }
          }
        } catch (err) {
          console.warn('Failed to set variant inventory on Etsy:', err);
        }
      }

      // 8. Update Firestore with Etsy data
      await ProductRepository.updateEtsyCache(productId, etsyListingId, {
        title: listing.title,
        description: listing.description,
        url: listing.url,
        taxonomyId: listing.taxonomy_id,
        tags: listing.tags,
        state: 'draft',
        syncedAt: new Date(),
      });

      // Update variant etsyProductId mappings if we have them
      if (variantEtsyProductIds && variantEtsyProductIds.size > 0) {
        const updatedVariants: ProductVariant[] = product.variants.map((v) => ({
          ...v,
          etsyProductId: variantEtsyProductIds!.get(v.id) ?? v.etsyProductId,
        }));
        await ProductRepository.updateVariants(productId, updatedVariants);
      }

      // 9. Activate if requested
      let finalState: 'draft' | 'active' = 'draft';
      if (activateAfterPush) {
        try {
          await client.listings.activateListing(listing.listing_id);
          finalState = 'active';

          // Update the cache state to active
          await ProductRepository.updateEtsyCache(productId, etsyListingId, {
            title: listing.title,
            description: listing.description,
            url: listing.url,
            taxonomyId: listing.taxonomy_id,
            tags: listing.tags,
            state: 'active',
            syncedAt: new Date(),
          });
        } catch (err) {
          console.warn(
            'Failed to activate listing (may need image/shipping profile):',
            err
          );
        }
      }

      // Refetch the product to return the updated version
      const refreshed = (await ProductRepository.findById(
        productId
      )) as Product;

      return {
        success: true,
        etsyListingId,
        product: refreshed,
      };
    }
  );
