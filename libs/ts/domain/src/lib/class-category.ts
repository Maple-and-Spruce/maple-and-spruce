/**
 * Class Category domain types
 *
 * Categories for organizing classes/workshops.
 * Separate from product categories (different ordering, descriptions, purposes).
 *
 * Examples: Fiber Arts, Woodworking, Ceramics, Natural Dyeing
 */
import type { GalleryImage } from './gallery-image';

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
  /**
   * Shared image pool for classes in this category. Classes can copy
   * URLs from this pool into their own `galleryImages` without
   * re-uploading. Order is encoded by array position; capped at
   * `GALLERY_IMAGE_MAX`.
   */
  galleryImages?: GalleryImage[];
  /**
   * Webflow CMS item ID from the last sync. Lets the sync update the item
   * directly instead of scanning the collection by `firebase-id`, and is
   * what the class sync writes into each class item's `category` reference
   * field so Webflow can render related classes natively.
   */
  webflowItemId?: string;
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
