/**
 * Resolve Sync Conflict Cloud Function
 *
 * Resolves a sync conflict between Firestore and an external system (Square/Etsy).
 * Applies the chosen resolution and marks the conflict as resolved.
 *
 * Resolution actions:
 * - use_local: Push Firestore data to external system
 * - use_external: Pull external data into Firestore
 * - manual: Mark resolved without data sync (admin fixed manually)
 * - ignored: Acknowledge but intentionally keep the mismatch
 *
 * @see ADR-012 for sync conflict detection and resolution strategy
 */
import {
  Functions,
  Role,
  throwNotFound,
  throwInvalidArgument,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import {
  SyncConflictRepository,
  ProductRepository,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { syncConflictResolutionValidation } from '@maple/ts/validation';
import type {
  ResolveSyncConflictRequest,
  ResolveSyncConflictResponse,
} from '@maple/ts/firebase/api-types';

export const resolveSyncConflict = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<ResolveSyncConflictRequest, ResolveSyncConflictResponse>(
    async (data, context, secrets, strings) => {
      // Validate input
      const validationResult = syncConflictResolutionValidation(data);
      if (!validationResult.isValid()) {
        const errors = validationResult.getErrors();
        const errorMessages = Object.entries(errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ');
        throwInvalidArgument(`Validation failed: ${errorMessages}`);
      }

      // Get the conflict
      const conflict = await SyncConflictRepository.findById(data.conflictId);
      if (!conflict) {
        throwNotFound('SyncConflict', data.conflictId);
      }

      // Check conflict is still pending
      if (conflict.status !== 'pending') {
        throwFailedPrecondition(
          `Conflict is already ${conflict.status}. Cannot resolve again.`
        );
      }

      const resolvedBy = context.uid ?? 'unknown';

      // Handle resolution based on type
      switch (data.resolution) {
        case 'use_local':
          await applyUseLocal(conflict, secrets, strings);
          break;

        case 'use_external':
          await applyUseExternal(conflict);
          break;

        case 'manual':
        case 'ignored':
          // No data sync needed, just mark resolved
          break;
      }

      // Mark conflict as resolved
      const resolved = await SyncConflictRepository.resolve(
        data.conflictId,
        data.resolution,
        resolvedBy,
        data.notes
      );

      return { conflict: resolved };
    }
  );

/**
 * Apply "use_local" resolution - push Firestore data to external system
 */
async function applyUseLocal(
  conflict: Awaited<ReturnType<typeof SyncConflictRepository.findById>>,
  secrets: Record<string, string>,
  strings: Record<string, string>
): Promise<void> {
  if (!conflict) return;

  if (conflict.externalState.system === 'square') {
    // Get the product
    const product = await ProductRepository.findById(conflict.productId);
    if (!product) {
      throw new Error(`Product not found: ${conflict.productId}`);
    }

    // Initialize Square client
    const square = new Square(
      secrets as typeof secrets &
        Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
      strings as typeof strings &
        Record<(typeof SQUARE_STRING_NAMES)[number], string>
    );

    // Handle different conflict types
    switch (conflict.type) {
      case 'quantity_mismatch':
        // Push local quantity to Square
        if (product.squareVariationId) {
          const locationId = product.squareLocationId ?? square.locationId;
          await square.inventoryService.setQuantity({
            squareVariationId: product.squareVariationId,
            locationId,
            quantity: conflict.localState.quantity,
          });
        }
        break;

      case 'price_mismatch':
        // Push local price to Square
        if (
          product.squareItemId &&
          product.squareVariationId &&
          product.squareCatalogVersion !== undefined
        ) {
          await square.catalogService.updateItem({
            squareItemId: product.squareItemId,
            squareVariationId: product.squareVariationId,
            squareCatalogVersion: product.squareCatalogVersion,
            priceCents: conflict.localState.price,
          });
        }
        break;

      case 'missing_external':
        // Product exists locally but not in Square - would need to create in Square
        // This is a complex case that may require user intervention
        throw new Error(
          'Cannot automatically restore deleted Square item. Please recreate the product manually.'
        );

      default:
        // Other conflict types don't support use_local resolution
        break;
    }
  } else if (conflict.externalState.system === 'etsy') {
    // Etsy integration not yet implemented
    throw new Error('Etsy sync not yet implemented');
  }
}

/**
 * Apply "use_external" resolution - pull external data into Firestore
 */
async function applyUseExternal(
  conflict: Awaited<ReturnType<typeof SyncConflictRepository.findById>>
): Promise<void> {
  if (!conflict) return;

  // Get the product
  const product = await ProductRepository.findById(conflict.productId);
  if (!product) {
    throw new Error(`Product not found: ${conflict.productId}`);
  }

  // Handle different conflict types
  switch (conflict.type) {
    case 'quantity_mismatch':
      // Update Firestore cache with external quantity
      await ProductRepository.updateCachedQuantity(
        conflict.productId,
        conflict.externalState.quantity
      );
      break;

    case 'price_mismatch':
      // Update Firestore cache with external price
      await ProductRepository.updateSquareCache(conflict.productId, {
        priceCents: conflict.externalState.price,
      });
      break;

    case 'missing_local':
      // Product exists in external system but not locally
      // This would require creating the product - complex case
      throw new Error(
        'Cannot automatically import product from external system. Please create the product manually.'
      );

    default:
      // Other conflict types - just update the cache
      await ProductRepository.updateSquareCache(conflict.productId, {
        name: conflict.externalState.name,
        priceCents: conflict.externalState.price,
        quantity: conflict.externalState.quantity,
      });
      break;
  }
}
