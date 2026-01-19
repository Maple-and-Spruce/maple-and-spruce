/**
 * Category API request/response types
 *
 * Types for Firebase Cloud Function calls related to categories.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@maple/ts/domain';

// ============================================================================
// Get Categories
// ============================================================================

export interface GetCategoriesRequest {
  // No filters needed - categories are a small, global list
}

export interface GetCategoriesResponse {
  categories: Category[];
}

// ============================================================================
// Get Category by ID
// ============================================================================

export interface GetCategoryRequest {
  id: string;
}

export interface GetCategoryResponse {
  category: Category;
}

// ============================================================================
// Create Category
// ============================================================================

export interface CreateCategoryRequest extends CreateCategoryInput {}

export interface CreateCategoryResponse {
  category: Category;
}

// ============================================================================
// Update Category
// ============================================================================

export interface UpdateCategoryRequest extends UpdateCategoryInput {}

export interface UpdateCategoryResponse {
  category: Category;
}

// ============================================================================
// Delete Category
// ============================================================================

export interface DeleteCategoryRequest {
  id: string;
}

export interface DeleteCategoryResponse {
  success: boolean;
}

// ============================================================================
// Reorder Categories
// ============================================================================

/**
 * Reorder categories by providing the complete ordered list of category IDs.
 * All categories will have their order values renormalized (0, 10, 20, etc.)
 */
export interface ReorderCategoriesRequest {
  /** Category IDs in the desired order (first = order 0, second = order 10, etc.) */
  categoryIds: string[];
}

export interface ReorderCategoriesResponse {
  /** Updated categories with new order values */
  categories: Category[];
}
