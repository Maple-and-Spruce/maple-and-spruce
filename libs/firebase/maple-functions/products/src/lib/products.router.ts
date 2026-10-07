/**
 * products — shop inventory and its categories in `maple-core`, as one Cloud
 * Function (ADR-029, #68).
 *
 * Every route is gated `[Admin, Clerk]`: the clerk runs the shop floor. The
 * product writes that call Square (`createProduct`, `updateProduct`,
 * `uploadProductImage`) live in the `maple-square` codebase and are not here —
 * a router is per (domain × codebase). `uploadCategoryGalleryImage` serves
 * *class* categories, so it belongs with classes (#74), not here.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import { Functions, Role, throwNotFound } from '@maple/firebase/functions';
import {
  CategoryRepository,
  ProductRepository,
} from '@maple/firebase/database';
import { categoryValidation } from '@maple/ts/validation';
import type {
  CreateCategoryRequest,
  CreateCategoryResponse,
  DeleteCategoryRequest,
  DeleteCategoryResponse,
  DeleteProductRequest,
  DeleteProductResponse,
  GetCategoriesRequest,
  GetCategoriesResponse,
  GetProductRequest,
  GetProductResponse,
  GetProductsRequest,
  GetProductsResponse,
  ReorderCategoriesRequest,
  ReorderCategoriesResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
} from '@maple/ts/firebase/api-types';

export const products = Functions.router('products', {
  /** All products, optionally filtered by artistId or status. */
  getProducts: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .asRoute<GetProductsRequest, GetProductsResponse>(async (data) => {
      const products = await ProductRepository.findAll({
        artistId: data.artistId,
        status: data.status,
      });

      return { products };
    }),

  getProduct: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .asRoute<GetProductRequest, GetProductResponse>(async (data) => {
      const product = await ProductRepository.findById(data.id);

      if (!product) {
        throwNotFound('Product', data.id);
      }

      return { product };
    }),

  deleteProduct: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .asRoute<DeleteProductRequest, DeleteProductResponse>(async (data) => {
      const existing = await ProductRepository.findById(data.id);
      if (!existing) {
        throwNotFound('Product', data.id);
      }

      await ProductRepository.delete(data.id);

      return { success: true };
    }),

  /** All categories, in display order. */
  getCategories: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .asRoute<GetCategoriesRequest, GetCategoriesResponse>(async () => {
      const categories = await CategoryRepository.findAll();

      return { categories };
    }),

  createCategory: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .asRoute<CreateCategoryRequest, CreateCategoryResponse>(async (data) => {
      const validationResult = categoryValidation(data);
      if (!validationResult.isValid()) {
        const errors = validationResult.getErrors();
        const errorMessages = Object.entries(errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }

      const existingCategory = await CategoryRepository.findByName(data.name);
      if (existingCategory) {
        throw new Error(`A category with name "${data.name}" already exists`);
      }

      const category = await CategoryRepository.create(data);

      return { category };
    }),

  updateCategory: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .asRoute<UpdateCategoryRequest, UpdateCategoryResponse>(async (data) => {
      const existing = await CategoryRepository.findById(data.id);
      if (!existing) {
        throwNotFound('Category', data.id);
      }

      // Validate the merged result, so a partial update is checked whole.
      const merged = { ...existing, ...data };
      const validationResult = categoryValidation(merged);
      if (!validationResult.isValid()) {
        const errors = validationResult.getErrors();
        const errorMessages = Object.entries(errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }

      if (data.name && data.name !== existing.name) {
        const existingWithName = await CategoryRepository.findByName(data.name);
        if (existingWithName) {
          throw new Error(`A category with name "${data.name}" already exists`);
        }
      }

      const category = await CategoryRepository.update(data);

      return { category };
    }),

  /**
   * Sets every category's order from its position in `categoryIds`, in one
   * batch. The list must name each existing category exactly once.
   */
  reorderCategories: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .asRoute<ReorderCategoriesRequest, ReorderCategoriesResponse>(
      async (data) => {
        const { categoryIds } = data;

        if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
          throw new Error('categoryIds must be a non-empty array');
        }

        const existingCategories = await CategoryRepository.findAll();
        const existingIds = new Set(existingCategories.map((c) => c.id));

        const invalidIds = categoryIds.filter((id) => !existingIds.has(id));
        if (invalidIds.length > 0) {
          throw new Error(`Invalid category IDs: ${invalidIds.join(', ')}`);
        }

        const uniqueIds = new Set(categoryIds);
        if (uniqueIds.size !== categoryIds.length) {
          throw new Error('Duplicate category IDs in request');
        }

        const categories = await CategoryRepository.reorderAll(categoryIds);

        return { categories };
      }
    ),

  /** Refused while any product still uses the category. */
  deleteCategory: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .asRoute<DeleteCategoryRequest, DeleteCategoryResponse>(async (data) => {
      const existing = await CategoryRepository.findById(data.id);
      if (!existing) {
        throwNotFound('Category', data.id);
      }

      const productCount = await CategoryRepository.countProductsWithCategory(
        data.id
      );
      if (productCount > 0) {
        throw new Error(
          `Cannot delete category "${existing.name}" because ${productCount} product(s) are using it. ` +
            'Please reassign or remove the category from those products first.'
        );
      }

      await CategoryRepository.delete(data.id);

      return { success: true };
    }),
});
