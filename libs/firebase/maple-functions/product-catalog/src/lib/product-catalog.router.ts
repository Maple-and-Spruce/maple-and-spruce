/**
 * productCatalog — the shop product writes that go through Square, as one
 * Cloud Function in `maple-square` (ADR-029, #68).
 *
 * Every route is gated `[Admin, Clerk]`, as on the `products` router: the
 * clerk runs the shop floor. The reads, deletes and categories are on
 * `products` in `maple-core`; these stay apart because they need the Square
 * SDK and its secrets, and a router is per codebase.
 *
 * Every route already held the same Square access token and strings as its own
 * function, so sharing one widens nothing.
 *
 * Each route spells its gate and secrets out in full:
 * `tools/check-callable-roles.ts` reads `requiringRole` off the AST and cannot
 * see through a helper.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import type {
  CreateProductRequest,
  CreateProductResponse,
  UpdateProductRequest,
  UpdateProductResponse,
  UploadProductImageRequest,
  UploadProductImageResponse,
} from '@maple/ts/firebase/api-types';
import { createProduct } from './create-product';
import { updateProduct } from './update-product';
import { uploadProductImage } from './upload-product-image';

export const productCatalog = Functions.router('productCatalog', {
  /** A new Square catalog item with its variations and stock, then the Firestore record. */
  createProduct: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<CreateProductRequest, CreateProductResponse>(createProduct),

  /** Square-owned fields and stock go to Square first; the rest straight to Firestore. */
  updateProduct: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<UpdateProductRequest, UpdateProductResponse>(updateProduct),

  /** The product's primary image, stored on Square's CDN. */
  uploadProductImage: Functions.endpoint
    .requiringRole([Role.Admin, Role.Clerk])
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<UploadProductImageRequest, UploadProductImageResponse>(
      uploadProductImage,
    ),
});
