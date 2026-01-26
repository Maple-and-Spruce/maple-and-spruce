/**
 * Class Category domain types
 *
 * Categories for organizing classes/workshops.
 * Separate from product categories (different ordering, descriptions, purposes).
 *
 * Examples: Fiber Arts, Woodworking, Ceramics, Natural Dyeing
 */

/**
 * Class Category entity
 */
export interface ClassCategory {
  id: string;
  /** Category name */
  name: string;
  /** Category description for display */
  description?: string;
  /** Display order (lower numbers first) */
  order: number;
  /** Icon or emoji for visual display (e.g., "🧶" or icon name) */
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new class category (no id, timestamps auto-generated)
 */
export type CreateClassCategoryInput = Omit<
  ClassCategory,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Input for updating a class category (all fields optional except id)
 */
export type UpdateClassCategoryInput = Partial<
  Omit<ClassCategory, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};
