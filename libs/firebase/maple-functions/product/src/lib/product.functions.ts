/**
 * Product Cloud Functions
 *
 * CRUD operations for product/inventory management.
 */
import {
  createAdminFunction,
  createAuthenticatedFunction,
  createPublicFunction,
} from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import { throwNotFound } from '@maple/firebase/functions';
import { productValidation } from '@maple/ts/validation';
import type {
  GetProductsRequest,
  GetProductsResponse,
  GetProductRequest,
  GetProductResponse,
  CreateProductRequest,
  CreateProductResponse,
  UpdateProductRequest,
  UpdateProductResponse,
  DeleteProductRequest,
  DeleteProductResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Get all products, optionally filtered by artistId or status
 */
export const getProducts = createAuthenticatedFunction<
  GetProductsRequest,
  GetProductsResponse
>(async (data) => {
  const products = await ProductRepository.findAll({
    artistId: data.artistId,
    status: data.status,
  });

  return { products };
});

/**
 * Get a single product by ID
 */
export const getProduct = createAuthenticatedFunction<
  GetProductRequest,
  GetProductResponse
>(async (data) => {
  const product = await ProductRepository.findById(data.id);

  if (!product) {
    throwNotFound('Product', data.id);
  }

  return { product };
});

/**
 * Create a new product (admin only)
 */
export const createProduct = createAdminFunction<
  CreateProductRequest,
  CreateProductResponse
>(async (data) => {
  // Validate input
  const validationResult = productValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const product = await ProductRepository.create(data);

  return { product };
});

/**
 * Update an existing product (admin only)
 */
export const updateProduct = createAdminFunction<
  UpdateProductRequest,
  UpdateProductResponse
>(async (data) => {
  // Check product exists
  const existing = await ProductRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Product', data.id);
  }

  // Validate update data (merge with existing for full validation)
  const merged = { ...existing, ...data };
  const validationResult = productValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const product = await ProductRepository.update(data);

  return { product };
});

/**
 * Delete a product (admin only)
 */
export const deleteProduct = createAdminFunction<
  DeleteProductRequest,
  DeleteProductResponse
>(async (data) => {
  // Check product exists
  const existing = await ProductRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Product', data.id);
  }

  await ProductRepository.delete(data.id);

  return { success: true };
});
