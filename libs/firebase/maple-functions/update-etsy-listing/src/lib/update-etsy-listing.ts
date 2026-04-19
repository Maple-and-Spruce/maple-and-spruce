/**
 * Update Etsy Listing Cloud Function
 *
 * Syncs current product data from Firestore to an existing Etsy listing.
 * Updates listing fields (title, description, tags) and variant inventory
 * (prices, quantities).
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
  type UpdateListingInput,
  type EtsyWhoMade,
  type EtsyWhenMade,
} from '@maple/firebase/etsy';
import { mergeEtsyTemplates, getTotalQuantity } from '@maple/ts/domain';
import type { Product, ProductVariant } from '@maple/ts/domain';
import type {
  UpdateEtsyListingRequest,
  UpdateEtsyListingResponse,
} from '@maple/ts/firebase/api-types';
import type {
  UpdateInventoryProduct,
  UpdateInventoryOffering,
  UpdateInventoryPropertyValue,
} from '@maple/firebase/etsy';

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

export const updateEtsyListing = Functions.endpoint
  .usingSecrets(...ETSY_SECRET_NAMES)
  .usingStrings(...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<UpdateEtsyListingRequest, UpdateEtsyListingResponse>(
    async (data, _context, secrets, strings) => {
      const { productId } = data;

      if (!productId) {
        return { success: false, error: 'productId is required' };
      }

      // 1. Fetch product from Firestore
      const product = await ProductRepository.findById(productId);
      if (!product) {
        return { success: false, error: `Product ${productId} not found` };
      }

      if (!product.etsyListingId) {
        return {
          success: false,
          error:
            'Product does not have an Etsy listing. Use pushProductToEtsy first.',
        };
      }

      const etsyListingId = Number(product.etsyListingId);

      // 2. Resolve template defaults for tags/materials/taxonomy
      const [categoryTemplate, artistTemplate] = await Promise.all([
        product.categoryId
          ? EtsyTemplateRepository.getCategoryTemplate(product.categoryId)
          : Promise.resolve(undefined),
        product.artistId
          ? EtsyTemplateRepository.getArtistTemplate(product.artistId)
          : Promise.resolve(undefined),
      ]);

      const defaults = mergeEtsyTemplates(categoryTemplate, artistTemplate);

      // 3. Build the update payload
      const firstVariant = product.variants[0];
      const totalQuantity = getTotalQuantity(product);

      const updateInput: UpdateListingInput = {
        title: (product.squareCache.name ?? '').substring(0, 140),
        description: product.squareCache.description,
        price: firstVariant.priceCents / 100,
        quantity: totalQuantity,
        tags: defaults.tags,
        materials: defaults.materials,
      };

      if (defaults.taxonomyId) {
        updateInput.taxonomy_id = defaults.taxonomyId;
      }
      if (defaults.whoMade) {
        updateInput.who_made = defaults.whoMade as EtsyWhoMade;
      }
      if (defaults.whenMade) {
        updateInput.when_made = defaults.whenMade as EtsyWhenMade;
      }

      // 4. Create Etsy client and update the listing
      const client = new EtsyClient({
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        tokenStorage: FirestoreTokenStorage,
        redirectUri: strings.ETSY_REDIRECT_URI,
      });

      const updatedListing = await client.listings.updateListing(
        etsyListingId,
        updateInput
      );

      // 5. Update variant inventory
      const isMultiVariant = product.variants.length > 1;
      let variantEtsyProductIds: Map<string, number> | undefined;

      if (isMultiVariant) {
        try {
          const propertyId = 100;
          const propertyName = product.variantProperties?.[0] ?? 'Variation';

          const inventoryProducts: UpdateInventoryProduct[] =
            product.variants.map((v) => ({
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

          const updatedInventory = await client.inventory.updateInventory(
            etsyListingId,
            {
              products: inventoryProducts,
              price_on_property: [propertyId],
              quantity_on_property: [propertyId],
              sku_on_property: [propertyId],
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
          console.warn('Failed to update variant inventory on Etsy:', err);
        }
      } else {
        // Single variant: use setQuantity for simplicity
        try {
          await client.inventory.setQuantity(
            etsyListingId,
            firstVariant.quantity
          );
        } catch (err) {
          console.warn('Failed to update quantity on Etsy:', err);
        }
      }

      // 6. Update etsyCache in Firestore
      await ProductRepository.updateEtsyCache(
        productId,
        product.etsyListingId,
        {
          title: updatedListing.title,
          description: updatedListing.description,
          url: updatedListing.url,
          taxonomyId: updatedListing.taxonomy_id,
          tags: updatedListing.tags,
          state:
            updatedListing.state === 'active' ||
            updatedListing.state === 'draft'
              ? updatedListing.state
              : 'inactive',
          syncedAt: new Date(),
        }
      );

      // Update variant etsyProductId mappings if we have them
      if (variantEtsyProductIds && variantEtsyProductIds.size > 0) {
        const updatedVariants: ProductVariant[] = product.variants.map((v) => ({
          ...v,
          etsyProductId: variantEtsyProductIds!.get(v.id) ?? v.etsyProductId,
        }));
        await ProductRepository.updateVariants(productId, updatedVariants);
      }

      // Refetch the product to return the updated version
      const refreshed = (await ProductRepository.findById(
        productId
      )) as Product;

      return {
        success: true,
        product: refreshed,
      };
    }
  );
