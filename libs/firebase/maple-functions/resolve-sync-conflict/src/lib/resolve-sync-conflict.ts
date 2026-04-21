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
  FirestoreTokenStorage,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { EtsyClient } from '@maple/firebase/etsy';
import { syncConflictResolutionValidation } from '@maple/ts/validation';
import type {
  ResolveSyncConflictRequest,
  ResolveSyncConflictResponse,
} from '@maple/ts/firebase/api-types';

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

export const resolveSyncConflict = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES, ...ETSY_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES, ...ETSY_STRING_NAMES)
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
    await applyUseLocalEtsy(conflict, secrets, strings);
  }
}

/**
 * Apply "use_local" resolution for Etsy - push Firestore data to Etsy
 */
async function applyUseLocalEtsy(
  conflict: Awaited<ReturnType<typeof SyncConflictRepository.findById>>,
  secrets: Record<string, string>,
  strings: Record<string, string>
): Promise<void> {
  if (!conflict) return;

  const product = await ProductRepository.findById(conflict.productId);
  if (!product) {
    throw new Error(`Product not found: ${conflict.productId}`);
  }

  if (!product.etsyListingId) {
    throw new Error(`Product ${conflict.productId} has no Etsy listing ID`);
  }

  const etsyListingId = Number(product.etsyListingId);

  const client = new EtsyClient({
    apiKey: secrets.ETSY_API_KEY,
    sharedSecret: secrets.ETSY_SHARED_SECRET,
    tokenStorage: FirestoreTokenStorage,
    redirectUri: strings.ETSY_REDIRECT_URI,
  });

  switch (conflict.type) {
    case 'quantity_mismatch': {
      // Push local quantity to Etsy
      // Determine which variant's quantity to push
      const variant = conflict.variantId
        ? product.variants.find((v) => v.id === conflict.variantId)
        : product.variants[0];

      if (variant) {
        await client.inventory.setQuantity(etsyListingId, variant.quantity);
      }
      break;
    }

    case 'price_mismatch': {
      // Push local price to Etsy (update listing price + inventory)
      const variant = conflict.variantId
        ? product.variants.find((v) => v.id === conflict.variantId)
        : product.variants[0];

      if (variant) {
        // Update listing-level price
        await client.listings.updateListing(etsyListingId, {
          price: variant.priceCents / 100,
        });

        // Update inventory offering price via full replacement
        const currentInventory = await client.inventory.getInventory(etsyListingId);
        const cleaned = client.inventory.stripServerFields(currentInventory);
        for (const p of cleaned.products) {
          for (const offering of p.offerings) {
            offering.price = variant.priceCents / 100;
          }
        }
        await client.inventory.updateInventory(etsyListingId, cleaned);
      }
      break;
    }

    case 'missing_external':
      // Product exists locally but not on Etsy — would need to recreate
      throw new Error(
        'Cannot automatically restore deleted Etsy listing. Please recreate the listing manually.'
      );

    default:
      break;
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

  if (conflict.externalState.system === 'etsy') {
    // Etsy-specific resolution: update variant-level data
    await applyUseExternalEtsy(conflict, product);
    return;
  }

  // Square resolution (existing logic)
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

/**
 * Apply "use_external" resolution for Etsy — update Firestore variant data from Etsy
 */
async function applyUseExternalEtsy(
  conflict: Awaited<ReturnType<typeof SyncConflictRepository.findById>>,
  product: Awaited<ReturnType<typeof ProductRepository.findById>>
): Promise<void> {
  if (!conflict || !product) return;

  const variantId = conflict.variantId ?? product.variants[0]?.id;
  if (!variantId) return;

  switch (conflict.type) {
    case 'quantity_mismatch':
      // Update Firestore variant quantity from Etsy
      await ProductRepository.updateVariantQuantity(
        conflict.productId,
        variantId,
        conflict.externalState.quantity
      );
      break;

    case 'price_mismatch': {
      // Update Firestore variant price from Etsy
      const updatedVariants = product.variants.map((v) =>
        v.id === variantId
          ? { ...v, priceCents: conflict.externalState.price }
          : v
      );
      await ProductRepository.updateVariants(conflict.productId, updatedVariants);
      break;
    }

    case 'missing_local':
      throw new Error(
        'Cannot automatically import product from Etsy. Please create the product manually.'
      );

    default:
      break;
  }
}
