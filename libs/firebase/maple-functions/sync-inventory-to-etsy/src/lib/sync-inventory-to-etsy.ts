/**
 * Sync Inventory to Etsy Cloud Function
 *
 * Pushes current Firestore product quantities to the linked Etsy listing.
 * For single-variant products, uses InventoryService.setQuantity().
 * For multi-variant products, uses InventoryService.updateInventory()
 * with per-variant quantities.
 *
 * Admin callable. Input: { productId }
 * Lives in the maple-sync codebase (Etsy API dependency).
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  FirestoreTokenStorage,
  ProductRepository,
} from '@maple/firebase/database';
import { EtsyClient } from '@maple/firebase/etsy';
import type { Product } from '@maple/ts/domain';

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

interface SyncInventoryToEtsyRequest {
  productId: string;
}

interface SyncInventoryToEtsyResponse {
  success: boolean;
  error?: string;
  etsyListingId?: string;
}

export const syncInventoryToEtsy = Functions.endpoint
  .usingSecrets(...ETSY_SECRET_NAMES)
  .usingStrings(...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<SyncInventoryToEtsyRequest, SyncInventoryToEtsyResponse>(
    async (data, _context, secrets, strings) => {
      const { productId } = data;

      if (!productId) {
        return { success: false, error: 'productId is required' };
      }

      // 1. Fetch product
      const product = await ProductRepository.findById(productId);
      if (!product) {
        return { success: false, error: `Product ${productId} not found` };
      }

      if (!product.etsyListingId) {
        return {
          success: false,
          error: `Product ${productId} is not linked to an Etsy listing`,
        };
      }

      const etsyListingId = Number(product.etsyListingId);

      // 2. Create Etsy client
      const client = new EtsyClient({
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        tokenStorage: FirestoreTokenStorage,
        redirectUri: strings.ETSY_REDIRECT_URI,
      });

      // 3. Sync inventory
      if (product.variants.length === 1) {
        // Single variant: use setQuantity convenience method
        await client.inventory.setQuantity(
          etsyListingId,
          product.variants[0].quantity
        );
      } else {
        // Multi-variant: GET current inventory, update quantities, PUT back
        await syncMultiVariantInventory(client, product, etsyListingId);
      }

      // 4. Update etsyCache syncedAt
      if (product.etsyCache) {
        await ProductRepository.updateEtsyCache(
          productId,
          product.etsyListingId,
          {
            ...product.etsyCache,
            syncedAt: new Date(),
          }
        );
      }

      return {
        success: true,
        etsyListingId: product.etsyListingId,
      };
    }
  );

/**
 * Sync inventory for multi-variant products.
 *
 * Gets current Etsy inventory, strips server fields, updates quantities
 * by matching Etsy product_id to our variant's etsyProductId, then PUTs
 * the full inventory back.
 */
async function syncMultiVariantInventory(
  client: EtsyClient,
  product: Product,
  etsyListingId: number
): Promise<void> {
  const currentInventory = await client.inventory.getInventory(etsyListingId);
  const cleaned = client.inventory.stripServerFields(currentInventory);

  // Update quantities by matching Etsy product to our variants
  for (const etsyProduct of cleaned.products) {
    // Match by SKU (most reliable cross-system identifier)
    const matchingVariant = product.variants.find(
      (v) => v.sku === etsyProduct.sku
    );
    if (matchingVariant) {
      for (const offering of etsyProduct.offerings) {
        offering.quantity = matchingVariant.quantity;
      }
    }
  }

  await client.inventory.updateInventory(etsyListingId, cleaned);
}
