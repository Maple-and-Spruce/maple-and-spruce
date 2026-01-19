/**
 * Category domain types
 *
 * Global categories for organizing products in the inventory.
 * Categories are shared across all artists and products.
 */

export interface Category {
  id: string;
  name: string;
  /** Optional description for display */
  description?: string;
  /** Display order (lower numbers appear first) */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new category
 */
export type CreateCategoryInput = Omit<
  Category,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Input for updating a category
 */
export type UpdateCategoryInput = Partial<
  Omit<Category, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};
