/**
 * Update Product Cloud Function
 *
 * Updates an existing product (admin only).
 *
 * For Firestore-owned fields (artistId, status, customCommissionRate):
 * - Updates happen directly in Firestore
 *
 * For Square-owned fields (name, description):
 * - Updates Square Catalog API first, then updates Firestore cache
 *
 * For variant price/quantity changes:
 * - Updates Square Catalog API (prices) and Inventory API (quantities)
 * - Then updates Firestore variants
 *
 * Supports both multi-variant (data.variants[]) and legacy single-variant
 * (data.priceCents / data.quantity) update paths.
 */
import {
  Functions,
  Role,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import type { UpdateCatalogVariationInput } from '@maple/firebase/square';
import { productValidation } from '@maple/ts/validation';
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
      const existing = await ProductRepository.findById(data.id);
      if (!existing) {
        throwNotFound('Product', data.id);
      }

      // Validation must run before any Square writes -- invalid data must
      // never reach Square and fail halfway through.
      const fields = Object.keys(data).filter((key) => key !== 'id');
      if (fields.length > 0) {
        const result = productValidation({ ...existing, ...data }, fields);
        if (result.hasErrors()) {
          throwValidationError(result.getErrors());
        }
      }

      // Determine what kind of updates we have
      const hasItemLevelUpdates =
        data.name !== undefined || data.description !== undefined;

      // Multi-variant path: data.variants[] contains per-variant updates
      const hasVariantUpdates =
        data.variants !== undefined && data.variants.length > 0;

      // Legacy single-variant path
      const hasLegacyCatalogUpdate = data.priceCents !== undefined;
      const hasLegacyInventoryUpdate = data.quantity !== undefined;

      const needsSquare =
        hasItemLevelUpdates ||
        hasVariantUpdates ||
        hasLegacyCatalogUpdate ||
        hasLegacyInventoryUpdate;

      if (needsSquare) {
        if (
          !existing.squareItemId ||
          existing.squareCatalogVersion === undefined
        ) {
          throw new Error(
            'Product missing Square IDs. Cannot update catalog fields.'
          );
        }

        const square = new Square(
          secrets as typeof secrets &
            Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
          strings as typeof strings &
            Record<(typeof SQUARE_STRING_NAMES)[number], string>
        );

        const locationId = existing.squareLocationId ?? square.locationId;

        // --- Catalog update (item-level fields + per-variation prices) ---
        const hasCatalogUpdates =
          hasItemLevelUpdates || hasVariantUpdates || hasLegacyCatalogUpdate;

        if (hasCatalogUpdates) {
          // Build variation-level updates
          let variationUpdates: UpdateCatalogVariationInput[] | undefined;

          if (hasVariantUpdates) {
            // Map incoming variant data to existing variants by label match or index
            const mapped: UpdateCatalogVariationInput[] = [];
            for (const v of data.variants!) {
              const match = existing.variants.find(
                (ev) => ev.label === v.label
              );
              if (match?.squareVariationId) {
                mapped.push({
                  squareVariationId: match.squareVariationId,
                  name: v.label,
                  priceCents: v.priceCents,
                  sku: v.sku,
                });
              }
            }
            variationUpdates = mapped.length > 0 ? mapped : undefined;
          } else if (hasLegacyCatalogUpdate && existing.squareVariationId) {
            variationUpdates = [
              {
                squareVariationId: existing.squareVariationId,
                priceCents: data.priceCents,
              },
            ];
          }

          const catalogResult = await square.catalogService.updateItem({
            squareItemId: existing.squareItemId,
            squareCatalogVersion: existing.squareCatalogVersion,
            name: data.name,
            description: data.description,
            variations: variationUpdates,
          });

          // Update listing-level cache
          await ProductRepository.updateSquareCache(
            data.id,
            {
              name: data.name ?? existing.squareCache.name,
              description:
                data.description ?? existing.squareCache.description,
            },
            catalogResult.squareCatalogVersion
          );

          // Update variant prices in Firestore if variants were changed
          if (hasVariantUpdates) {
            const updatedVariants = existing.variants.map((ev) => {
              const incoming = data.variants!.find(
                (v) => v.label === ev.label
              );
              if (!incoming) return ev;
              return {
                ...ev,
                priceCents: incoming.priceCents ?? ev.priceCents,
                sku: incoming.sku ?? ev.sku,
              };
            });
            await ProductRepository.updateVariants(data.id, updatedVariants);
          }
        }

        // --- Inventory updates ---
        if (hasVariantUpdates) {
          // Set quantities for each variant that has a quantity field
          const inventoryEntries = data.variants!
            .filter((v) => v.quantity !== undefined && v.quantity !== null)
            .map((v) => {
              const match = existing.variants.find(
                (ev) => ev.label === v.label
              );
              return {
                squareVariationId: match?.squareVariationId ?? '',
                locationId,
                quantity: v.quantity,
              };
            })
            .filter((e) => e.squareVariationId);

          if (inventoryEntries.length > 0) {
            await square.inventoryService.setQuantities(inventoryEntries);

            // Update cached quantities per variant
            for (const entry of inventoryEntries) {
              await ProductRepository.updateCachedQuantity(
                data.id,
                entry.quantity,
                entry.squareVariationId
              );
            }
          }
        } else if (hasLegacyInventoryUpdate) {
          if (!existing.squareVariationId) {
            throw new Error(
              'Product missing Square variation ID. Cannot update inventory.'
            );
          }

          await square.inventoryService.setQuantity({
            squareVariationId: existing.squareVariationId,
            locationId,
            quantity: data.quantity!,
          });

          await ProductRepository.updateCachedQuantity(
            data.id,
            data.quantity!
          );
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
