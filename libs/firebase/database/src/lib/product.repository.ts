/**
 * Product Repository
 *
 * Handles all Firestore operations for products.
 * All database access should go through this repository.
 */
import { db } from './utilities/database.config';
import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ProductStatus,
} from '@maple/ts/domain';

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
  return {
    id: doc.id,
    artistId: data.artistId,
    name: data.name,
    description: data.description,
    price: data.price,
    sku: data.sku,
    etsyListingId: data.etsyListingId,
    status: data.status,
    imageUrl: data.imageUrl,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    soldAt: data.soldAt?.toDate(),
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
   * Find products by artist ID
   */
  async findByArtistId(artistId: string): Promise<Product[]> {
    return this.findAll({ artistId });
  },

  /**
   * Create a new product
   */
  async create(input: CreateProductInput): Promise<Product> {
    const docRef = db.collection(COLLECTION).doc();

    const data = {
      ...input,
      createdAt: new Date(),
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  /**
   * Update an existing product
   */
  async update(input: UpdateProductInput): Promise<Product> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    await docRef.update(updates);

    const updated = await docRef.get();
    const product = docToProduct(updated);

    if (!product) {
      throw new Error(`Product ${id} not found after update`);
    }

    return product;
  },

  /**
   * Delete a product
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Mark a product as sold
   */
  async markAsSold(id: string): Promise<Product> {
    return this.update({
      id,
      status: 'sold',
      soldAt: new Date(),
    });
  },
};
