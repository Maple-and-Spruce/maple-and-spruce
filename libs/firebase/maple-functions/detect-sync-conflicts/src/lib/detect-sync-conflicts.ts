/**
 * Detect Sync Conflicts Cloud Function
 *
 * Compares Firestore product data with external systems (Square, Etsy) to detect
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
 * - quantity_mismatch: Cached quantity differs from Square/Etsy inventory
 * - price_mismatch: Cached price differs from Square/Etsy catalog
 * - missing_external: Product exists in Firestore but not in Square/Etsy
 * - missing_local: Product exists in Square but not tracked in Firestore
 *
 * @see ADR-012 for sync conflict detection and resolution strategy
 * @see ADR-013 for webhook-based sync strategy
 */
import { Functions, Role } from '@maple/firebase/functions';
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
import type { EtsyListing, EtsyListingInventory } from '@maple/firebase/etsy';
import type { CreateSyncConflictInput, Product } from '@maple/ts/domain';
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

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

export const detectSyncConflicts = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES, ...ETSY_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES, ...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .withOptions({ memory: '512MiB', concurrency: 10 })
  .handle<DetectSyncConflictsRequest, DetectSyncConflictsResponse>(
    async (data, _context, secrets, strings) => {
      let detected = 0;
      let skipped = 0;

      // Detect Square conflicts
      if (!data.system || data.system === 'square') {
        const square = new Square(
          secrets as typeof secrets &
            Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
          strings as typeof strings &
            Record<(typeof SQUARE_STRING_NAMES)[number], string>
        );

        const result = await detectSquareConflicts(
          square,
          data.productIds
        );
        detected += result.detected;
        skipped += result.skipped;
      }

      // Detect Etsy conflicts
      if (!data.system || data.system === 'etsy') {
        const etsyClient = new EtsyClient({
          apiKey: (secrets as Record<string, string>).ETSY_API_KEY,
          sharedSecret: (secrets as Record<string, string>).ETSY_SHARED_SECRET,
          tokenStorage: FirestoreTokenStorage,
          redirectUri: (strings as Record<string, string>).ETSY_REDIRECT_URI,
        });

        const result = await detectEtsyConflicts(
          etsyClient,
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
          quantity: product.squareCache.quantity ?? 0,
          price: product.squareCache.priceCents ?? 0,
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
    if ((product.squareCache.quantity ?? 0) !== squareQuantity) {
      const result = await createConflictIfNoPending({
        productId: product.id,
        type: 'quantity_mismatch',
        detectedAt: new Date(),
        localState: {
          quantity: product.squareCache.quantity ?? 0,
          price: product.squareCache.priceCents ?? 0,
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
    if ((product.squareCache.priceCents ?? 0) !== squarePrice) {
      const result = await createConflictIfNoPending({
        productId: product.id,
        type: 'price_mismatch',
        detectedAt: new Date(),
        localState: {
          quantity: product.squareCache.quantity ?? 0,
          price: product.squareCache.priceCents ?? 0,
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
 * Detect conflicts between Firestore and Etsy
 *
 * For each product linked to Etsy (has etsyListingId), fetches the live Etsy
 * listing with inventory and compares per-variant quantity and price, plus
 * listing-level title.
 */
async function detectEtsyConflicts(
  etsyClient: EtsyClient,
  productIds?: string[]
): Promise<{ detected: number; skipped: number }> {
  let detected = 0;
  let skipped = 0;

  // Get products to check
  const allProducts = await ProductRepository.findAll();
  const products = productIds
    ? allProducts.filter((p) => productIds.includes(p.id))
    : allProducts.filter((p) => p.etsyListingId); // Only products linked to Etsy

  for (const product of products) {
    if (!product.etsyListingId) continue;

    const etsyListingId = Number(product.etsyListingId);

    let listing: EtsyListing;
    try {
      listing = await etsyClient.listings.getListing(etsyListingId, 'Inventory');
    } catch {
      // Listing not found on Etsy — missing_external
      const result = await createConflictIfNoPending({
        productId: product.id,
        type: 'missing_external',
        detectedAt: new Date(),
        localState: {
          quantity: product.etsyCache?.quantity ?? product.variants[0]?.quantity ?? 0,
          price: product.etsyCache?.priceCents ?? product.variants[0]?.priceCents ?? 0,
          name: product.etsyCache?.title ?? product.squareCache.name,
        },
        externalState: {
          system: 'etsy',
          quantity: 0,
          price: 0,
          name: '(deleted from Etsy)',
        },
      });
      if (result === 'created') detected++;
      if (result === 'already_pending') skipped++;
      continue;
    }

    // Compare title (listing-level)
    const localTitle = product.etsyCache?.title ?? product.squareCache.name;
    if (localTitle !== listing.title) {
      const result = await createConflictIfNoPending({
        productId: product.id,
        type: 'price_mismatch', // title mismatch is surfaced as price_mismatch for now
        detectedAt: new Date(),
        localState: {
          quantity: product.variants[0]?.quantity ?? 0,
          price: product.variants[0]?.priceCents ?? 0,
          name: localTitle,
        },
        externalState: {
          system: 'etsy',
          quantity: listing.quantity,
          price: listing.price ? Math.round(listing.price.amount / listing.price.divisor * 100) : 0,
          name: listing.title,
        },
      });
      if (result === 'created') detected++;
      if (result === 'already_pending') skipped++;
    }

    // Compare per-variant data using inventory
    const inventory = listing.inventory;
    if (inventory) {
      const etsyConflicts = compareEtsyVariants(product, inventory, listing);
      for (const conflict of etsyConflicts) {
        const result = await createConflictIfNoPending(conflict);
        if (result === 'created') detected++;
        if (result === 'already_pending') skipped++;
      }
    }
  }

  return { detected, skipped };
}

/**
 * Compare Firestore variants against Etsy inventory products.
 *
 * For each variant with an etsyProductId, compares quantity and price
 * against the matching Etsy inventory offering.
 */
function compareEtsyVariants(
  product: Product,
  inventory: EtsyListingInventory,
  listing: EtsyListing
): CreateSyncConflictInput[] {
  const conflicts: CreateSyncConflictInput[] = [];

  for (const variant of product.variants) {
    // Find matching Etsy inventory product by etsyProductId or SKU
    const etsyProduct = variant.etsyProductId
      ? inventory.products.find((p) => p.product_id === variant.etsyProductId)
      : inventory.products.find((p) => p.sku === variant.sku);

    if (!etsyProduct || etsyProduct.is_deleted) continue;

    // Get the first enabled offering
    const offering = etsyProduct.offerings.find((o) => o.is_enabled && !o.is_deleted);
    if (!offering) continue;

    const etsyQuantity = offering.quantity;
    const etsyPriceCents = Math.round(offering.price.amount / offering.price.divisor * 100);
    const localTitle = product.etsyCache?.title ?? product.squareCache.name;

    // Check for quantity mismatch
    if (variant.quantity !== etsyQuantity) {
      conflicts.push({
        productId: product.id,
        variantId: variant.id,
        variantLabel: variant.label,
        type: 'quantity_mismatch',
        detectedAt: new Date(),
        localState: {
          quantity: variant.quantity,
          price: variant.priceCents,
          name: localTitle,
        },
        externalState: {
          system: 'etsy',
          quantity: etsyQuantity,
          price: etsyPriceCents,
          name: listing.title,
        },
      });
    }

    // Check for price mismatch
    if (variant.priceCents !== etsyPriceCents) {
      conflicts.push({
        productId: product.id,
        variantId: variant.id,
        variantLabel: variant.label,
        type: 'price_mismatch',
        detectedAt: new Date(),
        localState: {
          quantity: variant.quantity,
          price: variant.priceCents,
          name: localTitle,
        },
        externalState: {
          system: 'etsy',
          quantity: etsyQuantity,
          price: etsyPriceCents,
          name: listing.title,
        },
      });
    }
  }

  return conflicts;
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
