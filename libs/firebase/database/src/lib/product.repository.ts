/**
 * Product Repository
 *
 * Handles all Firestore operations for products.
 * All database access should go through this repository.
 *
 * Products use a hybrid architecture (see ADR-010, ADR-013):
 * - Square owns catalog/inventory data
 * - Firestore owns business logic (artist links, commissions)
 * - squareCache contains cached Square data for fast reads
 * - variants[] contains per-variant data (price, quantity, SKU, external IDs)
 */
import { db } from './utilities/database.config';
import type {
  Product,
  ProductVariant,
  SquareCache,
  EtsyCache,
  CreateProductInput,
  UpdateProductInput,
  ProductStatus,
  SquareProductResult,
} from '@maple/ts/domain';
import {
  isCacheStale,
  generateVariantId,
  generateSku,
  resolveVariants,
} from '@maple/ts/domain';

const COLLECTION = 'products';

/**
 * Convert Firestore document to Product.
 *
 * Handles three data shapes:
 * 1. Current: squareCache (listing-level) + variants[]
 * 2. Legacy v2: squareCache with per-variant fields (priceCents, quantity, sku) + squareVariationId
 * 3. Legacy v1: flat fields (name, price, quantity, sku) at top level
 */
function docToProduct(
  doc: FirebaseFirestore.DocumentSnapshot
): Product | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;

  // --- Square cache (listing-level fields + deprecated per-variant fields) ---
  const squareCacheRaw = data.squareCache;
  const squareCache: SquareCache = squareCacheRaw
    ? {
        name: squareCacheRaw.name,
        description: squareCacheRaw.description,
        imageUrl: squareCacheRaw.imageUrl,
        syncedAt: squareCacheRaw.syncedAt?.toDate() ?? new Date(),
        // Deprecated fields populated below after variants are resolved
      }
    : {
        // Legacy v1 fallback
        name: data.name ?? '',
        description: data.description,
        imageUrl: data.imageUrl,
        syncedAt: data.lastSquareSyncAt?.toDate() ?? new Date(0),
      };

  // --- Etsy cache ---
  const etsyCache: EtsyCache | undefined = data.etsyCache
    ? {
        title: data.etsyCache.title,
        description: data.etsyCache.description,
        url: data.etsyCache.url,
        taxonomyId: data.etsyCache.taxonomyId,
        tags: data.etsyCache.tags,
        state: data.etsyCache.state,
        syncedAt: data.etsyCache.syncedAt?.toDate() ?? new Date(),
      }
    : undefined;

  // --- Variants: migrate from legacy if needed ---
  let variants: ProductVariant[];

  if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
    // Current format
    variants = data.variants.map((v: Record<string, unknown>) => ({
      id: (v.id as string) ?? generateVariantId(),
      label: (v.label as string) ?? 'Regular',
      sku: (v.sku as string) ?? '',
      priceCents: (v.priceCents as number) ?? 0,
      quantity: (v.quantity as number) ?? 0,
      squareVariationId: v.squareVariationId as string | undefined,
      etsyProductId: v.etsyProductId as number | undefined,
    }));
  } else {
    // Legacy: create single variant from squareCache or flat fields
    const legacyPrice = data.squareCache?.priceCents ?? data.price ?? 0;
    const legacyQty = data.squareCache?.quantity ?? data.quantity ?? 0;
    const legacySku = data.squareCache?.sku ?? data.sku ?? '';
    const legacyVariationId = data.squareVariationId ?? '';

    variants = [
      {
        id: generateVariantId(),
        label: 'Regular',
        sku: legacySku,
        priceCents: legacyPrice,
        quantity: legacyQty,
        squareVariationId: legacyVariationId || undefined,
      },
    ];
  }

  // Populate deprecated SquareCache fields from first variant for backward compat
  const firstVariant = variants[0];
  if (firstVariant) {
    squareCache.priceCents = firstVariant.priceCents;
    squareCache.quantity = firstVariant.quantity;
    squareCache.sku = firstVariant.sku;
  }

  // Populate deprecated EtsyCache fields from first variant
  if (etsyCache && firstVariant) {
    etsyCache.priceCents = firstVariant.priceCents;
    etsyCache.quantity = firstVariant.quantity;
  }

  return {
    id: doc.id,

    // Firestore-owned
    artistId: data.artistId,
    categoryId: data.categoryId,
    customCommissionRate: data.customCommissionRate,
    status: data.status,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),

    // Variants
    variants,
    variantProperties: data.variantProperties,

    // External system links
    squareItemId: data.squareItemId ?? '',
    squareVariationId: firstVariant?.squareVariationId,
    squareCatalogVersion: data.squareCatalogVersion,
    squareLocationId: data.squareLocationId,
    etsyListingId: data.etsyListingId,

    // Cached data
    squareCache,
    etsyCache,
  };
}

/**
 * Convert Product to Firestore document data
 */
function productToDoc(product: Omit<Product, 'id'>): Record<string, unknown> {
  return {
    artistId: product.artistId,
    categoryId: product.categoryId,
    customCommissionRate: product.customCommissionRate,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,

    // Variants
    variants: product.variants.map((v) => ({
      id: v.id,
      label: v.label,
      sku: v.sku,
      priceCents: v.priceCents,
      quantity: v.quantity,
      squareVariationId: v.squareVariationId,
      etsyProductId: v.etsyProductId,
    })),
    variantProperties: product.variantProperties,

    // External links (item-level)
    squareItemId: product.squareItemId,
    squareVariationId: product.squareVariationId ?? product.variants[0]?.squareVariationId,
    squareCatalogVersion: product.squareCatalogVersion,
    squareLocationId: product.squareLocationId,
    etsyListingId: product.etsyListingId,

    // Cached data (listing-level + deprecated per-variant fields for compat)
    squareCache: {
      name: product.squareCache.name,
      description: product.squareCache.description,
      imageUrl: product.squareCache.imageUrl,
      syncedAt: product.squareCache.syncedAt,
      priceCents: product.variants[0]?.priceCents,
      quantity: product.variants[0]?.quantity,
      sku: product.variants[0]?.sku,
    },

    ...(product.etsyCache && {
      etsyCache: {
        title: product.etsyCache.title,
        description: product.etsyCache.description,
        url: product.etsyCache.url,
        taxonomyId: product.etsyCache.taxonomyId,
        tags: product.etsyCache.tags,
        state: product.etsyCache.state,
        syncedAt: product.etsyCache.syncedAt,
      },
    }),
  };
}

/**
 * Product Repository - handles all Firestore operations for products
 */
export const ProductRepository = {
  /**
   * Find all products, optionally filtered by artistId and/or status
   */
  async findAll(filters?: {
    artistId?: string;
    status?: ProductStatus;
  }): Promise<Product[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.artistId) {
      query = query.where('artistId', '==', filters.artistId);
    }

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToProduct(doc))
      .filter((p): p is Product => p !== undefined);
  },

  /**
   * Find a product by ID
   */
  async findById(id: string): Promise<Product | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToProduct(doc);
  },

  /**
   * Find a product by Square item ID
   */
  async findBySquareItemId(squareItemId: string): Promise<Product | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('squareItemId', '==', squareItemId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToProduct(snapshot.docs[0]);
  },

  /**
   * Find products by artist ID
   */
  async findByArtistId(artistId: string): Promise<Product[]> {
    return this.findAll({ artistId });
  },

  /**
   * Find products with stale cache that need refreshing
   */
  async findStaleProducts(limit: number = 100): Promise<Product[]> {
    const products = await this.findAll();
    return products.filter(isCacheStale).slice(0, limit);
  },

  /**
   * Create a new product with Square data
   *
   * Called after successfully creating the item in Square.
   * The Square result provides the IDs and SKU.
   *
   * Optional `extras` carries Etsy linkage fields. When provided, they're
   * written to the same Firestore doc atomically with the rest of the
   * Product — closes the timeout window where importEtsyListings used to
   * leave orphan Products that had no `etsyListingId` (next retry's
   * dedup check returned null and re-imported the same listing). Pass
   * extras when the Product is born from an Etsy import; omit otherwise.
   */
  async create(
    input: CreateProductInput,
    squareResult: SquareProductResult,
    extras?: { etsyListingId?: string; etsyCache?: EtsyCache }
  ): Promise<Product> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    // Resolve variants from input
    const resolvedVariants = resolveVariants(input);

    // Map Square variation results to product variants
    const variants: ProductVariant[] = resolvedVariants.map((v, i) => {
      const squareVar = squareResult.variations[i];
      return {
        id: squareVar?.variantId ?? generateVariantId(),
        label: v.label,
        sku: squareVar?.sku ?? v.sku ?? generateSku(),
        priceCents: v.priceCents,
        quantity: v.quantity,
        squareVariationId: squareVar?.squareVariationId,
      };
    });

    const firstVar = variants[0];

    const product: Omit<Product, 'id'> = {
      // Firestore-owned
      artistId: input.artistId,
      categoryId: input.categoryId,
      customCommissionRate: input.customCommissionRate,
      status: input.status,
      createdAt: now,
      updatedAt: now,

      // Variants
      variants,
      variantProperties: input.variantProperties,

      // From Square result
      squareItemId: squareResult.squareItemId,
      squareVariationId: firstVar?.squareVariationId,
      squareCatalogVersion: squareResult.squareCatalogVersion,
      squareLocationId: squareResult.squareLocationId,

      // Etsy linkage (optional, written atomically with the rest)
      etsyListingId: extras?.etsyListingId,
      etsyCache: extras?.etsyCache,

      // Listing-level cache + deprecated per-variant fields for compat
      squareCache: {
        name: input.name,
        description: input.description,
        syncedAt: now,
        priceCents: firstVar?.priceCents,
        quantity: firstVar?.quantity,
        sku: firstVar?.sku,
      },
    };

    await docRef.set(productToDoc(product));

    return {
      id: docRef.id,
      ...product,
    };
  },

  /**
   * Update Firestore-owned fields only
   *
   * For Square-owned fields (name, price, etc.), use updateWithSquareSync
   */
  async update(input: UpdateProductInput): Promise<Product> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    // Only allow Firestore-owned fields
    const allowedUpdates: Partial<Product> = {};
    if (updates.artistId !== undefined)
      allowedUpdates.artistId = updates.artistId;
    if (updates.categoryId !== undefined)
      allowedUpdates.categoryId = updates.categoryId;
    if (updates.customCommissionRate !== undefined)
      allowedUpdates.customCommissionRate = updates.customCommissionRate;
    if (updates.status !== undefined) allowedUpdates.status = updates.status;

    await docRef.update({
      ...allowedUpdates,
      updatedAt: new Date(),
    });

    const updated = await docRef.get();
    const product = docToProduct(updated);

    if (!product) {
      throw new Error(`Product ${id} not found after update`);
    }

    return product;
  },

  /**
   * Update the Square cache (listing-level fields) after a successful Square API call
   */
  async updateSquareCache(
    id: string,
    cache: Partial<SquareCache>,
    squareCatalogVersion?: number
  ): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    const now = new Date();

    const updates: Record<string, unknown> = {
      updatedAt: now,
      'squareCache.syncedAt': now,
    };

    if (cache.name !== undefined) updates['squareCache.name'] = cache.name;
    if (cache.description !== undefined)
      updates['squareCache.description'] = cache.description;
    if (cache.imageUrl !== undefined)
      updates['squareCache.imageUrl'] = cache.imageUrl;
    // Deprecated per-variant fields — still written for backward compat
    if (cache.priceCents !== undefined)
      updates['squareCache.priceCents'] = cache.priceCents;
    if (cache.quantity !== undefined)
      updates['squareCache.quantity'] = cache.quantity;
    if (cache.sku !== undefined) updates['squareCache.sku'] = cache.sku;
    if (squareCatalogVersion !== undefined)
      updates['squareCatalogVersion'] = squareCatalogVersion;

    await docRef.update(updates);
  },

  /**
   * Update a specific variant's quantity (e.g. after a sale or inventory webhook)
   */
  async updateVariantQuantity(
    id: string,
    variantId: string,
    quantity: number
  ): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    const product = docToProduct(doc);

    if (!product) {
      throw new Error(`Product ${id} not found`);
    }

    const updatedVariants = product.variants.map((v) =>
      v.id === variantId ? { ...v, quantity } : v
    );

    await docRef.update({
      variants: updatedVariants.map((v) => ({
        id: v.id,
        label: v.label,
        sku: v.sku,
        priceCents: v.priceCents,
        quantity: v.quantity,
        squareVariationId: v.squareVariationId,
        etsyProductId: v.etsyProductId,
      })),
      'squareCache.syncedAt': new Date(),
      updatedAt: new Date(),
    });
  },

  /**
   * Update just the cached quantity for a variant by Square variation ID.
   * Used by inventory webhooks.
   */
  async updateCachedQuantity(
    id: string,
    quantity: number,
    squareVariationId?: string
  ): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    const product = docToProduct(doc);

    if (!product) {
      throw new Error(`Product ${id} not found`);
    }

    const updatedVariants = product.variants.map((v) => {
      // If squareVariationId specified, match on it; otherwise update first variant
      const isTarget = squareVariationId
        ? v.squareVariationId === squareVariationId
        : true;
      return isTarget ? { ...v, quantity } : v;
    });

    await docRef.update({
      variants: updatedVariants.map((v) => ({
        id: v.id,
        label: v.label,
        sku: v.sku,
        priceCents: v.priceCents,
        quantity: v.quantity,
        squareVariationId: v.squareVariationId,
        etsyProductId: v.etsyProductId,
      })),
      'squareCache.syncedAt': new Date(),
      updatedAt: new Date(),
    });
  },

  /**
   * Replace all variants on a product (e.g. after Square catalog sync)
   */
  async updateVariants(
    id: string,
    variants: ProductVariant[],
    variantProperties?: string[]
  ): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    const updateData: Record<string, unknown> = {
      variants: variants.map((v) => ({
        id: v.id,
        label: v.label,
        sku: v.sku,
        priceCents: v.priceCents,
        quantity: v.quantity,
        squareVariationId: v.squareVariationId,
        etsyProductId: v.etsyProductId,
      })),
      updatedAt: new Date(),
    };

    if (variantProperties !== undefined) {
      updateData['variantProperties'] = variantProperties;
    }

    await docRef.update(updateData);
  },

  /**
   * Find a product by Etsy listing ID
   */
  async findByEtsyListingId(
    etsyListingId: string
  ): Promise<Product | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('etsyListingId', '==', etsyListingId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToProduct(snapshot.docs[0]);
  },

  /**
   * Find products for a batch of Etsy listing IDs.
   *
   * Used by the Etsy import page to cross-reference which listings are
   * already synced. Firestore's `in` clause caps at 30 values, so requests
   * larger than that are chunked transparently.
   */
  async findByEtsyListingIds(
    etsyListingIds: string[]
  ): Promise<Product[]> {
    if (etsyListingIds.length === 0) return [];

    const CHUNK_SIZE = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < etsyListingIds.length; i += CHUNK_SIZE) {
      chunks.push(etsyListingIds.slice(i, i + CHUNK_SIZE));
    }

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const snapshot = await db
          .collection(COLLECTION)
          .where('etsyListingId', 'in', chunk)
          .get();
        return snapshot.docs
          .map((doc) => docToProduct(doc))
          .filter((p): p is Product => p !== undefined);
      })
    );

    return results.flat();
  },

  /**
   * Update the Etsy cache after a successful Etsy API call
   */
  async updateEtsyCache(
    id: string,
    etsyListingId: string,
    cache: EtsyCache
  ): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    await docRef.update({
      etsyListingId,
      etsyCache: {
        title: cache.title,
        description: cache.description,
        url: cache.url,
        taxonomyId: cache.taxonomyId,
        tags: cache.tags,
        state: cache.state,
        syncedAt: cache.syncedAt,
        priceCents: cache.priceCents,
        quantity: cache.quantity,
      },
      updatedAt: new Date(),
    });
  },

  /**
   * Delete a product
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Mark a product as discontinued
   */
  async markAsDiscontinued(id: string): Promise<Product> {
    return this.update({
      id,
      status: 'discontinued',
    });
  },
};
