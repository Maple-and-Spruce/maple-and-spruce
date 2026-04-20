/**
 * Create Product Cloud Function
 *
 * Creates a new product by:
 * 1. Validating input
 * 2. Creating catalog item in Square (with one or more variations)
 * 3. Setting initial inventory quantities in Square
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
import { resolveVariants } from '@maple/ts/domain';
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
        variantCount: data.variants?.length,
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

      // Resolve variants from input (handles both single and multi-variant)
      const resolvedVariants = resolveVariants(data);

      // 1. Create catalog item in Square with all variations
      const catalogResult = await square.catalogService.createItem({
        name: data.name,
        description: data.description,
        variants: resolvedVariants.map((v) => ({
          label: v.label,
          priceCents: v.priceCents,
          sku: v.sku,
        })),
      });

      console.log('Square catalog item created:', catalogResult);

      // 2. Set initial inventory quantities for each variation
      const inventoryEntries = resolvedVariants
        .map((v, i) => ({
          squareVariationId: catalogResult.variations[i]?.squareVariationId ?? '',
          locationId: square.locationId,
          quantity: v.quantity,
        }))
        .filter((e) => e.quantity > 0 && e.squareVariationId);

      if (inventoryEntries.length > 0) {
        await square.inventoryService.setQuantities(inventoryEntries);
      }

      // 3. Create Firestore record with Square IDs
      const product = await ProductRepository.create(data, {
        squareItemId: catalogResult.squareItemId,
        squareCatalogVersion: catalogResult.squareCatalogVersion,
        squareLocationId: square.locationId,
        variations: catalogResult.variations,
        // Legacy fields for backward compatibility
        squareVariationId: catalogResult.squareVariationId,
        sku: catalogResult.sku,
      });

      return { product };
    }
  );
