/**
 * Sync Inventory to Square Cloud Function
 *
 * Pushes current Firestore product quantities to Square for each variant
 * that has a squareVariationId. Uses physical count adjustments to set
 * the absolute quantity.
 *
 * Admin callable. Input: { productId }
 * Lives in the maple-square codebase (Square SDK dependency).
 */
import { Functions, Role } from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';

interface SyncInventoryToSquareRequest {
  productId: string;
}

interface SyncInventoryToSquareResponse {
  success: boolean;
  error?: string;
  syncedVariants: number;
}

export const syncInventoryToSquare = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<SyncInventoryToSquareRequest, SyncInventoryToSquareResponse>(
    async (data, _context, secrets, strings) => {
      const { productId } = data;

      if (!productId) {
        return { success: false, error: 'productId is required', syncedVariants: 0 };
      }

      // 1. Fetch product
      const product = await ProductRepository.findById(productId);
      if (!product) {
        return { success: false, error: `Product ${productId} not found`, syncedVariants: 0 };
      }

      // 2. Collect variants with Square variation IDs
      const variantsToSync = product.variants.filter(
        (v) => v.squareVariationId
      );

      if (variantsToSync.length === 0) {
        return {
          success: false,
          error: 'No variants with Square variation IDs',
          syncedVariants: 0,
        };
      }

      // 3. Create Square client
      const square = new Square(secrets, strings);
      const locationId = product.squareLocationId || square.locationId;

      // 4. Batch set quantities for all variants
      await square.inventoryService.setQuantities(
        variantsToSync.map((v) => ({
          squareVariationId: v.squareVariationId!,
          locationId,
          quantity: v.quantity,
        }))
      );

      // 5. Update squareCache syncedAt
      await ProductRepository.updateSquareCache(productId, {
        syncedAt: new Date(),
      });

      return {
        success: true,
        syncedVariants: variantsToSync.length,
      };
    }
  );
