/**
 * Upload Product Image Cloud Function
 *
 * Uploads a product image to Square Catalog (admin only).
 *
 * Unlike artist images (stored in Firebase Storage), product images
 * are stored in Square's CDN. This keeps product images in sync with
 * the Square catalog and POS system.
 *
 * Flow:
 * 1. Validate input (product must exist)
 * 2. Upload image to Square via Catalog API
 * 3. Update Firestore cache with the new image URL
 */
import { Functions, Role } from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import type {
  UploadProductImageRequest,
  UploadProductImageResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Allowed image MIME types (matches Square's supported formats)
 */
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/gif',
];

/**
 * Max file size: 15MB (Square's limit)
 */
const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;

export const uploadProductImage = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<UploadProductImageRequest, UploadProductImageResponse>(
    async (data, _context, secrets, strings) => {
      const { productId, imageBase64, contentType, caption } = data;

      // Validate required fields
      if (!productId) {
        throw new Error('productId is required');
      }

      if (!imageBase64) {
        throw new Error('imageBase64 is required');
      }

      if (!contentType) {
        throw new Error('contentType is required');
      }

      // Validate content type
      if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
        throw new Error(
          `Invalid content type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`
        );
      }

      // Validate base64 size (rough estimate)
      const estimatedBytes = Math.ceil(imageBase64.length * 0.75);
      if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
        throw new Error('Image too large. Maximum size is 15MB.');
      }

      // Find the product to get Square item ID
      const product = await ProductRepository.findById(productId);
      if (!product) {
        throw new Error(`Product not found: ${productId}`);
      }

      if (!product.squareItemId) {
        throw new Error(
          'Product does not have a Square item ID. Cannot upload image.'
        );
      }

      console.log('Uploading image for product:', {
        productId,
        squareItemId: product.squareItemId,
        contentType,
      });

      // Initialize Square client
      const square = new Square(
        secrets as typeof secrets &
          Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
        strings as typeof strings &
          Record<(typeof SQUARE_STRING_NAMES)[number], string>
      );

      // Convert base64 to Blob for Square API
      const buffer = Buffer.from(imageBase64, 'base64');
      const blob = new Blob([buffer], { type: contentType });

      // Generate filename from content type
      const extension = contentType.split('/')[1] || 'jpg';
      const filename = `product-${productId}.${extension}`;

      // Upload to Square
      const result = await square.catalogService.uploadImage({
        squareItemId: product.squareItemId,
        imageBlob: blob,
        filename,
        caption: caption || product.squareCache.name,
        isPrimary: true,
      });

      console.log('Square image upload successful:', result);

      // Update Firestore cache with the new image URL and catalog version
      // IMPORTANT: Uploading an image changes the catalog version, so we must
      // update it in Firestore to avoid version mismatch errors on subsequent updates
      await ProductRepository.updateSquareCache(
        productId,
        { imageUrl: result.imageUrl },
        result.squareCatalogVersion
      );

      return {
        success: true,
        imageUrl: result.imageUrl,
        squareImageId: result.squareImageId,
      };
    }
  );
