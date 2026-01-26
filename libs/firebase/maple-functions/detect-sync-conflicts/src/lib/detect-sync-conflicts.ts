/**
 * Detect Sync Conflicts Cloud Function
 *
 * Compares Firestore product data with external systems (Square) to detect
 * mismatches. Creates SyncConflict records for any discrepancies found.
 *
 * This is designed for edge cases - webhook failures, downtime, or data
 * corruption. Normal sync happens automatically via webhooks (ADR-013).
 *
 * Behavior:
 * - Only creates new conflicts if there's no PENDING conflict for the same
 *   product/type/system combination
 * - Once a conflict is resolved, a new conflict can be created for the same
 *   product if another mismatch is detected
 * - This preserves full resolution history while avoiding duplicate pending items
 *
 * Conflict types detected:
 * - quantity_mismatch: Cached quantity differs from Square inventory
 * - price_mismatch: Cached price differs from Square catalog
 * - missing_external: Product exists in Firestore but not in Square
 * - missing_local: Product exists in Square but not tracked in Firestore
 *
 * @see ADR-012 for sync conflict detection and resolution strategy
 * @see ADR-013 for webhook-based sync strategy
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  SyncConflictRepository,
  ProductRepository,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import type { CreateSyncConflictInput } from '@maple/ts/domain';
import type { Square as SquareTypes } from 'square';
import type {
  DetectSyncConflictsRequest,
  DetectSyncConflictsResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Type guard to check if a CatalogObject is an ITEM type
 */
function isItemCatalogObject(
  obj: SquareTypes.CatalogObject
): obj is SquareTypes.CatalogObject & { type: 'ITEM'; itemData: SquareTypes.CatalogItem } {
  return obj.type === 'ITEM';
}

/**
 * Safely extract item data from a catalog object
 */
function getItemData(obj: SquareTypes.CatalogObject): {
  name: string;
  variations: SquareTypes.CatalogObject[];
} {
  if (isItemCatalogObject(obj) && obj.itemData) {
    return {
      name: obj.itemData.name || '',
      variations: obj.itemData.variations || [],
    };
  }
  return { name: '', variations: [] };
}

export const detectSyncConflicts = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<DetectSyncConflictsRequest, DetectSyncConflictsResponse>(
    async (data, _context, secrets, strings) => {
      // Initialize Square client
      const square = new Square(
        secrets as typeof secrets &
          Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
        strings as typeof strings &
          Record<(typeof SQUARE_STRING_NAMES)[number], string>
      );

      let detected = 0;
      let skipped = 0;

      // Only detect Square conflicts for now (Etsy not implemented)
      if (!data.system || data.system === 'square') {
        const result = await detectSquareConflicts(
          square,
          data.productIds
        );
        detected += result.detected;
        skipped += result.skipped;
      }

      // Get all pending conflicts to return
      const conflicts = await SyncConflictRepository.findPending();

      // Return detected (new conflicts created) and updated (kept for API compatibility, now always 0)
      return { detected, updated: skipped, conflicts };
    }
  );

/**
 * Detect conflicts between Firestore and Square
 */
async function detectSquareConflicts(
  square: Square,
  productIds?: string[]
): Promise<{ detected: number; skipped: number }> {
  let detected = 0;
  let skipped = 0; // Already have pending conflict

  // Get products to check
  const allProducts = await ProductRepository.findAll();
  const products = productIds
    ? allProducts.filter((p) => productIds.includes(p.id))
    : allProducts.filter((p) => p.squareItemId); // Only products linked to Square

  // Get all Square catalog items
  const squareItems = await square.catalogService.listItems();
  const squareItemMap = new Map<string, SquareTypes.CatalogObject>();
  for (const item of squareItems) {
    if (item.id) {
      squareItemMap.set(item.id, item);
    }
  }

  // Get Square inventory counts for all variations
  const variationIds = products
    .map((p) => p.squareVariationId)
    .filter((id): id is string => !!id);

  const inventoryCounts = variationIds.length > 0
    ? await square.inventoryService.getCounts(variationIds, square.locationId)
    : [];

  const inventoryMap = new Map<string, number>();
  for (const count of inventoryCounts) {
    inventoryMap.set(count.squareVariationId, count.quantity);
  }

  // Check each product for conflicts
  for (const product of products) {
    if (!product.squareItemId) continue;

    const squareItem = squareItemMap.get(product.squareItemId);

    if (!squareItem) {
      // Product exists in Firestore but not in Square
      const result = await createConflictIfNoPending({
        productId: product.id,
        type: 'missing_external',
        detectedAt: new Date(),
        localState: {
          quantity: product.squareCache.quantity,
          price: product.squareCache.priceCents,
          name: product.squareCache.name,
        },
        externalState: {
          system: 'square',
          quantity: 0,
          price: 0,
          name: '(deleted from Square)',
        },
      });
      if (result === 'created') detected++;
      if (result === 'already_pending') skipped++;
      continue;
    }

    // Get Square data
    const itemData = getItemData(squareItem);
    const squareVariation = itemData.variations[0];
    const variationData = squareVariation?.type === 'ITEM_VARIATION'
      ? (squareVariation as SquareTypes.CatalogObject & { itemVariationData?: SquareTypes.CatalogItemVariation }).itemVariationData
      : undefined;
    const squarePrice = variationData?.priceMoney?.amount
      ? Number(variationData.priceMoney.amount)
      : 0;
    const squareName = itemData.name;
    const squareQuantity = product.squareVariationId
      ? inventoryMap.get(product.squareVariationId) ?? 0
      : 0;

    // Check for quantity mismatch
    if (product.squareCache.quantity !== squareQuantity) {
      const result = await createConflictIfNoPending({
        productId: product.id,
        type: 'quantity_mismatch',
        detectedAt: new Date(),
        localState: {
          quantity: product.squareCache.quantity,
          price: product.squareCache.priceCents,
          name: product.squareCache.name,
        },
        externalState: {
          system: 'square',
          quantity: squareQuantity,
          price: squarePrice,
          name: squareName,
        },
      });
      if (result === 'created') detected++;
      if (result === 'already_pending') skipped++;
    }

    // Check for price mismatch
    if (product.squareCache.priceCents !== squarePrice) {
      const result = await createConflictIfNoPending({
        productId: product.id,
        type: 'price_mismatch',
        detectedAt: new Date(),
        localState: {
          quantity: product.squareCache.quantity,
          price: product.squareCache.priceCents,
          name: product.squareCache.name,
        },
        externalState: {
          system: 'square',
          quantity: squareQuantity,
          price: squarePrice,
          name: squareName,
        },
      });
      if (result === 'created') detected++;
      if (result === 'already_pending') skipped++;
    }
  }

  // Check for Square items not in Firestore (missing_local)
  const trackedSquareIds = new Set(
    products.map((p) => p.squareItemId).filter(Boolean)
  );

  for (const squareItem of squareItems) {
    if (!squareItem.id || trackedSquareIds.has(squareItem.id)) continue;

    const itemData = getItemData(squareItem);
    const squareVariation = itemData.variations[0];
    const variationData = squareVariation?.type === 'ITEM_VARIATION'
      ? (squareVariation as SquareTypes.CatalogObject & { itemVariationData?: SquareTypes.CatalogItemVariation }).itemVariationData
      : undefined;
    const squarePrice = variationData?.priceMoney?.amount
      ? Number(variationData.priceMoney.amount)
      : 0;
    const squareName = itemData.name;
    const squareQuantity = squareVariation?.id
      ? inventoryMap.get(squareVariation.id) ?? 0
      : 0;

    // Check if we already have a pending conflict for this
    // Use squareItemId as the "productId" for missing_local conflicts
    const existingConflict = await SyncConflictRepository.findExistingConflict(
      squareItem.id, // Using Square ID as productId for missing_local
      'missing_local',
      'square'
    );

    if (!existingConflict) {
      await SyncConflictRepository.create({
        productId: squareItem.id, // Using Square ID temporarily
        type: 'missing_local',
        detectedAt: new Date(),
        localState: {
          quantity: 0,
          price: 0,
          name: '(not in Firestore)',
        },
        externalState: {
          system: 'square',
          quantity: squareQuantity,
          price: squarePrice,
          name: squareName,
        },
      });
      detected++;
    }
  }

  return { detected, skipped };
}

/**
 * Create a new conflict if no pending conflict exists for this product/type/system.
 *
 * This ensures:
 * - No duplicate pending conflicts for the same issue
 * - Full history is preserved (resolved conflicts are never updated)
 * - New conflicts are created after resolution if the issue recurs
 */
async function createConflictIfNoPending(
  input: CreateSyncConflictInput
): Promise<'created' | 'already_pending'> {
  // Check if a pending conflict already exists for this product/type/system
  const existingPending = await SyncConflictRepository.findExistingConflict(
    input.productId,
    input.type,
    input.externalState.system
  );

  if (existingPending) {
    // Already have a pending conflict for this - don't create duplicate
    return 'already_pending';
  }

  // Create new conflict (preserves history - old resolved conflicts stay)
  await SyncConflictRepository.create(input);
  return 'created';
}
