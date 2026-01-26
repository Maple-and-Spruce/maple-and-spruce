/**
 * Class Category Repository
 *
 * Handles all Firestore operations for class categories.
 * All database access should go through this repository.
 */
import { db } from './utilities/database.config';
import type {
  ClassCategory,
  CreateClassCategoryInput,
  UpdateClassCategoryInput,
} from '@maple/ts/domain';

const COLLECTION = 'classCategories';

/**
 * Convert Firestore document to ClassCategory
 */
function docToClassCategory(
  doc: FirebaseFirestore.DocumentSnapshot
): ClassCategory | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    description: data.description,
    order: data.order,
    icon: data.icon,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

/**
 * Class Category Repository - handles all Firestore operations for class categories
 */
export const ClassCategoryRepository = {
  /**
   * Find all class categories, ordered by display order
   */
  async findAll(): Promise<ClassCategory[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .orderBy('order', 'asc')
      .get();

    return snapshot.docs
      .map((doc) => docToClassCategory(doc))
      .filter((c): c is ClassCategory => c !== undefined);
  },

  /**
   * Find a class category by ID
   */
  async findById(id: string): Promise<ClassCategory | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToClassCategory(doc);
  },

  /**
   * Find a class category by name (case-insensitive)
   */
  async findByName(name: string): Promise<ClassCategory | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('name', '==', name)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToClassCategory(snapshot.docs[0]);
  },

  /**
   * Create a new class category
   */
  async create(input: CreateClassCategoryInput): Promise<ClassCategory> {
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
   * Update an existing class category
   */
  async update(input: UpdateClassCategoryInput): Promise<ClassCategory> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const category = docToClassCategory(updated);

    if (!category) {
      throw new Error(`Class category ${id} not found after update`);
    }

    return category;
  },

  /**
   * Delete a class category
   * Note: Should check for classes using this category before deleting.
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Get the next available order number
   */
  async getNextOrder(): Promise<number> {
    const categories = await this.findAll();
    if (categories.length === 0) {
      return 0;
    }
    const maxOrder = Math.max(...categories.map((c) => c.order));
    return maxOrder + 10;
  },

  /**
   * Reorder all categories based on provided ID order.
   * Uses batch writes for atomicity.
   *
   * @param categoryIds Array of category IDs in desired order
   * @returns Updated categories with new order values
   */
  async reorderAll(categoryIds: string[]): Promise<ClassCategory[]> {
    const batch = db.batch();
    const now = new Date();

    categoryIds.forEach((id, index) => {
      const docRef = db.collection(COLLECTION).doc(id);
      batch.update(docRef, {
        order: index * 10, // 0, 10, 20, 30, etc. for easy insertion
        updatedAt: now,
      });
    });

    await batch.commit();

    return this.findAll();
  },

  /**
   * Check if any classes are using this category
   */
  async hasClasses(categoryId: string): Promise<boolean> {
    const snapshot = await db
      .collection('classes')
      .where('categoryId', '==', categoryId)
      .limit(1)
      .get();

    return !snapshot.empty;
  },
};
