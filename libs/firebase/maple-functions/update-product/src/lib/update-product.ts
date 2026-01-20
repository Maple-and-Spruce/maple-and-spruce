/**
 * Update Product Cloud Function
 *
 * Updates an existing product (admin only).
 *
 * For Firestore-owned fields (artistId, status, customCommissionRate):
 * - Updates happen directly in Firestore
 *
 * For Square-owned fields (name, description, priceCents):
 * - Updates Square Catalog API first, then updates Firestore cache
 *
 * For quantity changes:
 * - Updates Square Inventory API, then updates Firestore cache
 */
import { Functions, Role, throwNotFound } from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import type {
  UpdateProductRequest,
  UpdateProductResponse,
} from '@maple/ts/firebase/api-types';

export const updateProduct = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<UpdateProductRequest, UpdateProductResponse>(
    async (data, _context, secrets, strings) => {
      // Check product exists
      const existing = await ProductRepository.findById(data.id);
      if (!existing) {
        throwNotFound('Product', data.id);
      }

      // Validate Firestore-owned fields
      if (
        data.status &&
        !['active', 'draft', 'discontinued'].includes(data.status)
      ) {
        throw new Error('Status must be active, draft, or discontinued');
      }

      if (
        data.customCommissionRate !== undefined &&
        (data.customCommissionRate < 0 || data.customCommissionRate > 1)
      ) {
        throw new Error('Commission rate must be between 0 and 1');
      }

      // Check if any Square-owned fields are being updated
      const hasCatalogUpdates =
        data.name !== undefined ||
        data.description !== undefined ||
        data.priceCents !== undefined;

      const hasInventoryUpdates = data.quantity !== undefined;

      // Handle Square updates if needed
      if (hasCatalogUpdates || hasInventoryUpdates) {
        // Initialize Square client
        const square = new Square(
          secrets as typeof secrets &
            Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
          strings as typeof strings &
            Record<(typeof SQUARE_STRING_NAMES)[number], string>
        );

        // Update catalog if needed
        if (hasCatalogUpdates) {
          if (
            !existing.squareItemId ||
            !existing.squareVariationId ||
            existing.squareCatalogVersion === undefined
          ) {
            throw new Error(
              'Product missing Square IDs. Cannot update catalog fields.'
            );
          }

          const catalogResult = await square.catalogService.updateItem({
            squareItemId: existing.squareItemId,
            squareVariationId: existing.squareVariationId,
            squareCatalogVersion: existing.squareCatalogVersion,
            name: data.name,
            description: data.description,
            priceCents: data.priceCents,
          });

          // Update cache with new values
          await ProductRepository.updateSquareCache(
            data.id,
            {
              name: data.name ?? existing.squareCache.name,
              description: data.description ?? existing.squareCache.description,
              priceCents: data.priceCents ?? existing.squareCache.priceCents,
            },
            catalogResult.squareCatalogVersion
          );
        }

        // Update inventory if needed
        if (hasInventoryUpdates) {
          if (!existing.squareVariationId) {
            throw new Error(
              'Product missing Square variation ID. Cannot update inventory.'
            );
          }

          const locationId =
            existing.squareLocationId ?? square.locationId;

          await square.inventoryService.setQuantity({
            squareVariationId: existing.squareVariationId,
            locationId,
            quantity: data.quantity!,
          });

          // Update cached quantity
          await ProductRepository.updateCachedQuantity(data.id, data.quantity!);
        }
      }

      // Update Firestore-owned fields
      const product = await ProductRepository.update({
        id: data.id,
        artistId: data.artistId,
        categoryId: data.categoryId,
        customCommissionRate: data.customCommissionRate,
        status: data.status,
      });

      return { product };
    }
  );
