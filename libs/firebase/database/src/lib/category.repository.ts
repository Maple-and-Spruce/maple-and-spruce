/**
 * Category Repository
 *
 * Handles all Firestore operations for categories.
 * All database access should go through this repository.
 */
import { db } from './utilities/database.config';
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@maple/ts/domain';

const COLLECTION = 'categories';

/**
 * Convert Firestore document to Category
 */
function docToCategory(
  doc: FirebaseFirestore.DocumentSnapshot
): Category | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    description: data.description,
    order: data.order ?? 0,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

/**
 * Category Repository - handles all Firestore operations for categories
 */
export const CategoryRepository = {
  /**
   * Find all categories, ordered by display order
   */
  async findAll(): Promise<Category[]> {
    const query = db.collection(COLLECTION).orderBy('order', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToCategory(doc))
      .filter((c): c is Category => c !== undefined);
  },

  /**
   * Find a category by ID
   */
  async findById(id: string): Promise<Category | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToCategory(doc);
  },

  /**
   * Find a category by name (case-insensitive)
   */
  async findByName(name: string): Promise<Category | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('name', '==', name)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToCategory(snapshot.docs[0]);
  },

  /**
   * Create a new category
   */
  async create(input: CreateCategoryInput): Promise<Category> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  /**
   * Update an existing category
   */
  async update(input: UpdateCategoryInput): Promise<Category> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const category = docToCategory(updated);

    if (!category) {
      throw new Error(`Category ${id} not found after update`);
    }

    return category;
  },

  /**
   * Delete a category
   * Note: Consider checking for products using this category before deleting
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Count products using a specific category
   */
  async countProductsWithCategory(categoryId: string): Promise<number> {
    const snapshot = await db
      .collection('products')
      .where('categoryId', '==', categoryId)
      .count()
      .get();

    return snapshot.data().count;
  },

  /**
   * Reorder all categories by setting order values based on position in array.
   * Uses a batch write to update all categories atomically.
   *
   * @param categoryIds - Array of category IDs in the desired order
   * @returns Updated categories with new order values
   */
  async reorderAll(categoryIds: string[]): Promise<Category[]> {
    const batch = db.batch();
    const now = new Date();

    // Update each category's order based on its position
    categoryIds.forEach((id, index) => {
      const docRef = db.collection(COLLECTION).doc(id);
      batch.update(docRef, {
        order: index * 10, // 0, 10, 20, 30, etc.
        updatedAt: now,
      });
    });

    await batch.commit();

    // Fetch and return all categories in their new order
    return this.findAll();
  },
};
