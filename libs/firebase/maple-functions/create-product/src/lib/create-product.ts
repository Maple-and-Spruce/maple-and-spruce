/**
 * Create Product Cloud Function
 *
 * Creates a new product by:
 * 1. Validating input
 * 2. Creating catalog item in Square
 * 3. Setting initial inventory quantity in Square
 * 4. Creating linking record in Firestore
 *
 * Admin only.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { productValidation } from '@maple/ts/validation';
import type {
  CreateProductRequest,
  CreateProductResponse,
} from '@maple/ts/firebase/api-types';

export const createProduct = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<CreateProductRequest, CreateProductResponse>(
    async (data, _context, secrets, strings) => {
      console.log('createProduct called with:', {
        name: data.name,
        priceCents: data.priceCents,
        quantity: data.quantity,
      });

      // Validate input
      const validationResult = productValidation(data);
      if (!validationResult.isValid()) {
        const errors = validationResult.getErrors();
        const errorMessages = Object.entries(errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }

      console.log('Validation passed, initializing Square client...');

      // Initialize Square client
      const square = new Square(
        secrets as typeof secrets & Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
        strings as typeof strings & Record<(typeof SQUARE_STRING_NAMES)[number], string>
      );

      console.log('Square client initialized, creating catalog item...');

      // 1. Create catalog item in Square
      const catalogResult = await square.catalogService.createItem({
        name: data.name,
        description: data.description,
        priceCents: data.priceCents,
      });

      console.log('Square catalog item created:', catalogResult);

      // 2. Set initial inventory quantity
      if (data.quantity > 0) {
        await square.inventoryService.setQuantity({
          squareVariationId: catalogResult.squareVariationId,
          locationId: square.locationId,
          quantity: data.quantity,
        });
      }

      // 3. Create Firestore record with Square IDs
      const product = await ProductRepository.create(data, {
        squareItemId: catalogResult.squareItemId,
        squareVariationId: catalogResult.squareVariationId,
        squareCatalogVersion: catalogResult.squareCatalogVersion,
        squareLocationId: square.locationId,
        sku: catalogResult.sku,
      });

      return { product };
    }
  );
