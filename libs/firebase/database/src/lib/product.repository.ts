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
 */
import { db } from './utilities/database.config';
import type {
  Product,
  SquareCache,
  CreateProductInput,
  UpdateProductInput,
  ProductStatus,
  SquareProductResult,
} from '@maple/ts/domain';
import { generateSku, isCacheStale } from '@maple/ts/domain';

const COLLECTION = 'products';

/**
 * Convert Firestore document to Product
 */
function docToProduct(
  doc: FirebaseFirestore.DocumentSnapshot
): Product | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;

  // Handle legacy flat structure or new squareCache structure
  const squareCache: SquareCache = data.squareCache
    ? {
        name: data.squareCache.name,
        description: data.squareCache.description,
        priceCents: data.squareCache.priceCents,
        quantity: data.squareCache.quantity,
        sku: data.squareCache.sku,
        imageUrl: data.squareCache.imageUrl,
        syncedAt: data.squareCache.syncedAt?.toDate() ?? new Date(),
      }
    : {
        // Legacy fallback - convert flat fields to squareCache
        name: data.name ?? '',
        description: data.description,
        priceCents: data.price ?? 0, // legacy field was 'price'
        quantity: data.quantity ?? 0,
        sku: data.sku ?? '',
        imageUrl: data.imageUrl,
        syncedAt: data.lastSquareSyncAt?.toDate() ?? new Date(0),
      };

  return {
    id: doc.id,

    // Firestore-owned
    artistId: data.artistId,
    categoryId: data.categoryId,
    customCommissionRate: data.customCommissionRate,
    status: data.status,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),

    // External system links
    squareItemId: data.squareItemId ?? '',
    squareVariationId: data.squareVariationId ?? '',
    squareCatalogVersion: data.squareCatalogVersion,
    squareLocationId: data.squareLocationId,
    etsyListingId: data.etsyListingId,

    // Cached data
    squareCache,
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

    squareItemId: product.squareItemId,
    squareVariationId: product.squareVariationId,
    squareCatalogVersion: product.squareCatalogVersion,
    squareLocationId: product.squareLocationId,
    etsyListingId: product.etsyListingId,

    squareCache: {
      name: product.squareCache.name,
      description: product.squareCache.description,
      priceCents: product.squareCache.priceCents,
      quantity: product.squareCache.quantity,
      sku: product.squareCache.sku,
      imageUrl: product.squareCache.imageUrl,
      syncedAt: product.squareCache.syncedAt,
    },
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
   */
  async create(
    input: CreateProductInput,
    squareResult: SquareProductResult
  ): Promise<Product> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const product: Omit<Product, 'id'> = {
      // Firestore-owned
      artistId: input.artistId,
      categoryId: input.categoryId,
      customCommissionRate: input.customCommissionRate,
      status: input.status,
      createdAt: now,
      updatedAt: now,

      // From Square result
      squareItemId: squareResult.squareItemId,
      squareVariationId: squareResult.squareVariationId,
      squareCatalogVersion: squareResult.squareCatalogVersion,
      squareLocationId: squareResult.squareLocationId,

      // No Etsy yet
      etsyListingId: undefined,

      // Initial cache from input (just created in Square)
      squareCache: {
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        quantity: input.quantity,
        sku: squareResult.sku,
        syncedAt: now,
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
   * Update the Square cache after a successful Square API call
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
    if (cache.priceCents !== undefined)
      updates['squareCache.priceCents'] = cache.priceCents;
    if (cache.quantity !== undefined)
      updates['squareCache.quantity'] = cache.quantity;
    if (cache.sku !== undefined) updates['squareCache.sku'] = cache.sku;
    if (cache.imageUrl !== undefined)
      updates['squareCache.imageUrl'] = cache.imageUrl;
    if (squareCatalogVersion !== undefined)
      updates['squareCatalogVersion'] = squareCatalogVersion;

    await docRef.update(updates);
  },

  /**
   * Update just the cached quantity (for inventory webhooks)
   */
  async updateCachedQuantity(id: string, quantity: number): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    await docRef.update({
      'squareCache.quantity': quantity,
      'squareCache.syncedAt': new Date(),
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
