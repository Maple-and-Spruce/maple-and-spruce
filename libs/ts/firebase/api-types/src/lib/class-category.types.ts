/**
 * Class Category API request/response types
 *
 * Types for Firebase Cloud Function calls related to class categories.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  ClassCategory,
  CreateClassCategoryInput,
  UpdateClassCategoryInput,
} from '@maple/ts/domain';

// ============================================================================
// Get Class Categories
// ============================================================================

/**
 * Request for class categories endpoint.
 * Currently empty but structured for future filtering support.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetClassCategoriesRequest {}

export interface GetClassCategoriesResponse {
  categories: ClassCategory[];
}

// ============================================================================
// Get Class Category by ID
// ============================================================================

export interface GetClassCategoryRequest {
  id: string;
}

export interface GetClassCategoryResponse {
  category: ClassCategory;
}

// ============================================================================
// Create Class Category
// ============================================================================

export interface CreateClassCategoryRequest extends CreateClassCategoryInput {}

export interface CreateClassCategoryResponse {
  category: ClassCategory;
}

// ============================================================================
// Update Class Category
// ============================================================================

export interface UpdateClassCategoryRequest extends UpdateClassCategoryInput {}

export interface UpdateClassCategoryResponse {
  category: ClassCategory;
}

// ============================================================================
// Delete Class Category
// ============================================================================

export interface DeleteClassCategoryRequest {
  id: string;
}

export interface DeleteClassCategoryResponse {
  success: boolean;
}

// ============================================================================
// Reorder Class Categories
// ============================================================================

export interface ReorderClassCategoriesRequest {
  /** Array of category IDs in desired order */
  categoryIds: string[];
}

export interface ReorderClassCategoriesResponse {
  /** Categories with updated order values */
  categories: ClassCategory[];
}
