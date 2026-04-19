/**
 * Square Catalog API service
 *
 * Handles creating, updating, and retrieving catalog items in Square.
 * Products in our system map to Square CatalogItems with CatalogItemVariations.
 *
 * @see https://developer.squareup.com/docs/catalog-api/what-it-does
 */
import { SquareClient, Square } from 'square';
import { generateSku, generateVariantId } from '@maple/ts/domain';
import type { SquareVariationResult } from '@maple/ts/domain';

/**
 * Input for uploading a catalog image
 */
export interface UploadCatalogImageInput {
  /** Square catalog item ID to attach the image to */
  squareItemId: string;
  /** Image file as a Blob */
  imageBlob: Blob;
  /** Image filename (for content-type detection) */
  filename: string;
  /** Optional image name/caption for Square */
  caption?: string;
  /** Whether this should be the primary image (default: true) */
  isPrimary?: boolean;
}

/**
 * Result of uploading a catalog image
 */
export interface UploadCatalogImageResult {
  /** Square image ID */
  squareImageId: string;
  /** Public URL of the uploaded image (hosted by Square) */
  imageUrl: string;
  /** Updated catalog version (uploading image changes the catalog version) */
  squareCatalogVersion: number;
}

/**
 * Input for a single catalog item variation
 */
export interface CatalogVariationInput {
  /** Variant label (used as variation name in Square) */
  label: string;
  /** Price in cents (e.g., 2500 = $25.00) */
  priceCents: number;
  /** SKU - if not provided, one will be generated */
  sku?: string;
  /** Internal variant ID - if not provided, one will be generated */
  variantId?: string;
}

/**
 * Input for creating a catalog item
 */
export interface CreateCatalogItemInput {
  /** Product name */
  name: string;
  /** Product description */
  description?: string;
  /** Price in cents (e.g., 2500 = $25.00) — used when variants is omitted */
  priceCents?: number;
  /** Initial quantity (optional, set via Inventory API) */
  quantity?: number;
  /** SKU - if not provided, one will be generated — used when variants is omitted */
  sku?: string;
  /**
   * Multiple variations. If provided, priceCents/sku at the top level are ignored.
   * If omitted, a single "Regular" variation is created from priceCents/sku.
   */
  variants?: CatalogVariationInput[];
}

/**
 * Result of creating a catalog item
 */
export interface CreateCatalogItemResult {
  /** Square catalog item ID */
  squareItemId: string;
  /** Square catalog version (for optimistic locking) */
  squareCatalogVersion: number;
  /** Per-variation results */
  variations: SquareVariationResult[];

  // --- Legacy fields for backward compatibility ---
  /** @deprecated Use variations[0].squareVariationId */
  squareVariationId: string;
  /** @deprecated Use variations[0].sku */
  sku: string;
}

/**
 * Input for updating a single variation within a catalog item
 */
export interface UpdateCatalogVariationInput {
  /** Square variation ID to update */
  squareVariationId: string;
  /** Updated variation name/label (optional) */
  name?: string;
  /** Updated price in cents (optional) */
  priceCents?: number;
  /** Updated SKU (optional) */
  sku?: string;
}

/**
 * Input for updating a catalog item
 */
export interface UpdateCatalogItemInput {
  /** Square catalog item ID */
  squareItemId: string;
  /** Current catalog version (for optimistic locking) */
  squareCatalogVersion: number;
  /** Updated name (optional) */
  name?: string;
  /** Updated description (optional) */
  description?: string;

  /**
   * Multiple variation updates. If provided, the legacy squareVariationId/priceCents/sku
   * fields are ignored.
   */
  variations?: UpdateCatalogVariationInput[];

  // --- Legacy single-variation fields ---
  /** @deprecated Use variations[] instead */
  squareVariationId?: string;
  /** @deprecated Use variations[] instead */
  priceCents?: number;
  /** @deprecated Use variations[] instead */
  sku?: string;
}

/**
 * Result of updating a catalog item
 */
export interface UpdateCatalogItemResult {
  /** Updated catalog version */
  squareCatalogVersion: number;
}

/**
 * Catalog service for Square API operations
 */
export class CatalogService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Create a new catalog item with one or more variations
   *
   * Square uses a hierarchical model:
   * - CatalogItem: The product (name, description)
   * - CatalogItemVariation: The purchasable unit (price, SKU)
   *
   * If `variants` is provided, each entry becomes an ITEM_VARIATION.
   * If omitted, a single "Regular" variation is created from the
   * top-level priceCents/sku fields (backward compatible).
   */
  async createItem(input: CreateCatalogItemInput): Promise<CreateCatalogItemResult> {
    // Normalize to a variants array
    const variantInputs: Array<{ label: string; priceCents: number; sku: string; variantId: string }> =
      input.variants && input.variants.length > 0
        ? input.variants.map((v) => ({
            label: v.label,
            priceCents: v.priceCents,
            sku: v.sku || generateSku(),
            variantId: v.variantId || generateVariantId(),
          }))
        : [
            {
              label: 'Regular',
              priceCents: input.priceCents ?? 0,
              sku: input.sku || generateSku(),
              variantId: generateVariantId(),
            },
          ];

    const firstSku = variantInputs[0].sku;
    const idempotencyKey = `create-${firstSku}-${Date.now()}`;
    const itemId = `#item-${firstSku}`;

    // Build one ITEM_VARIATION per variant
    const variationObjects: Square.CatalogObject[] = variantInputs.map((v) => ({
      type: 'ITEM_VARIATION',
      id: `#variation-${v.sku}`,
      itemVariationData: {
        name: v.label,
        sku: v.sku,
        pricingType: 'FIXED_PRICING',
        priceMoney: {
          amount: BigInt(v.priceCents),
          currency: 'USD',
        },
        trackInventory: true,
      },
    }));

    const response = await this.client.catalog.batchUpsert({
      idempotencyKey,
      batches: [
        {
          objects: [
            {
              type: 'ITEM',
              id: itemId,
              itemData: {
                name: input.name,
                description: input.description,
                variations: variationObjects,
              },
            },
          ],
        },
      ],
    });

    // Check for errors in the response
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square API error: ${errorMessages}`);
    }

    // Find the created item in the response
    const createdObjects = response.objects || [];
    const itemObject = createdObjects.find(
      (obj: Square.CatalogObject) => obj.type === 'ITEM'
    );

    if (!itemObject) {
      console.error(
        'Square batchUpsert response:',
        JSON.stringify(response, null, 2)
      );
      throw new Error('Failed to create catalog item: no ITEM in response');
    }

    // Map response variations back to our result structure
    const responseVariations = itemObject.itemData?.variations || [];

    if (responseVariations.length === 0) {
      console.error(
        'Square batchUpsert itemObject:',
        JSON.stringify(itemObject, null, 2)
      );
      throw new Error(
        'Failed to create catalog item: no variations in ITEM response'
      );
    }

    // Match response variations to input variants by SKU
    const variations: SquareVariationResult[] = variantInputs.map((v) => {
      const matched = responseVariations.find(
        (rv) =>
          (rv as { itemVariationData?: { sku?: string } }).itemVariationData
            ?.sku === v.sku
      );
      return {
        variantId: v.variantId,
        squareVariationId: matched?.id ?? '',
        sku: v.sku,
      };
    });

    return {
      squareItemId: itemObject.id!,
      squareCatalogVersion: Number(itemObject.version || 0),
      variations,
      // Legacy fields for backward compatibility
      squareVariationId: variations[0]?.squareVariationId ?? '',
      sku: variations[0]?.sku ?? '',
    };
  }

  /**
   * Update an existing catalog item
   *
   * Uses optimistic locking via catalog version to prevent conflicts.
   * Supports updating multiple variations via the `variations` array,
   * or a single variation via the legacy `squareVariationId`/`priceCents`/`sku` fields.
   */
  async updateItem(input: UpdateCatalogItemInput): Promise<UpdateCatalogItemResult> {
    // First, retrieve the current item to get its full structure
    const currentResponse = await this.client.catalog.object.get({
      objectId: input.squareItemId,
      includeRelatedObjects: true,
    });

    const currentItem = currentResponse.object;
    if (!currentItem || currentItem.type !== 'ITEM') {
      throw new Error(`Catalog item not found: ${input.squareItemId}`);
    }

    // Check version for optimistic locking
    if (Number(currentItem.version) !== input.squareCatalogVersion) {
      throw new Error(
        `Catalog version mismatch: expected ${input.squareCatalogVersion}, got ${currentItem.version}`
      );
    }

    // Resolve which variations to update
    const variationUpdates = this.resolveVariationUpdates(input);

    // Collect all existing variations from the response
    const relatedObjects = currentResponse.relatedObjects || [];
    const nestedVariations = currentItem.itemData?.variations || [];

    // Helper to find an existing variation by ID
    const findVariation = (variationId: string): Square.CatalogObject | undefined => {
      return (
        relatedObjects.find((obj: Square.CatalogObject) => obj.id === variationId) ||
        (nestedVariations.find((v) => v.id === variationId) as Square.CatalogObject | undefined)
      );
    };

    // Build updated variation objects
    const updatedVariations: Square.CatalogObject[] = variationUpdates.map(
      (update) => {
        const existing = findVariation(update.squareVariationId);
        if (!existing || existing.type !== 'ITEM_VARIATION') {
          throw new Error(
            `Catalog variation not found: ${update.squareVariationId}`
          );
        }

        const existingTyped = existing as { itemVariationData?: Square.CatalogItemVariation };
        const currentData = existingTyped.itemVariationData;
        const updatedData: Square.CatalogItemVariation = {
          ...currentData,
          itemId: input.squareItemId,
          name: update.name ?? currentData?.name,
          sku: update.sku ?? currentData?.sku,
          priceMoney:
            update.priceCents !== undefined
              ? { amount: BigInt(update.priceCents), currency: 'USD' }
              : currentData?.priceMoney,
        };

        return {
          type: 'ITEM_VARIATION' as const,
          id: update.squareVariationId,
          version: existing.version,
          itemVariationData: updatedData,
        };
      }
    );

    // Build updated item data
    const updatedItemData: Square.CatalogItem = {
      ...currentItem.itemData,
      name: input.name ?? currentItem.itemData?.name,
      description: input.description ?? currentItem.itemData?.description,
      variations: updatedVariations,
    };

    const idempotencyKey = `update-${input.squareItemId}-${Date.now()}`;

    const response = await this.client.catalog.batchUpsert({
      idempotencyKey,
      batches: [
        {
          objects: [
            {
              type: 'ITEM',
              id: input.squareItemId,
              version: BigInt(input.squareCatalogVersion),
              itemData: updatedItemData,
            },
          ],
        },
      ],
    });

    const updatedItem = response.objects?.find(
      (obj: Square.CatalogObject) => obj.id === input.squareItemId
    );

    return {
      squareCatalogVersion: Number(updatedItem?.version || 0),
    };
  }

  /**
   * Normalize update input into an array of variation updates.
   * If `variations` array is provided, use it directly.
   * Otherwise, build a single-element array from the legacy fields.
   */
  private resolveVariationUpdates(
    input: UpdateCatalogItemInput
  ): UpdateCatalogVariationInput[] {
    if (input.variations && input.variations.length > 0) {
      return input.variations;
    }

    // Legacy single-variation path
    if (input.squareVariationId) {
      return [
        {
          squareVariationId: input.squareVariationId,
          priceCents: input.priceCents,
          sku: input.sku,
        },
      ];
    }

    // No variation updates
    return [];
  }

  /**
   * Get a catalog item by ID
   */
  async getItem(squareItemId: string): Promise<Square.CatalogObject | null> {
    try {
      const response = await this.client.catalog.object.get({
        objectId: squareItemId,
        includeRelatedObjects: true,
      });
      return response.object || null;
    } catch (error) {
      // Return null if not found
      if ((error as { statusCode?: number }).statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a catalog item
   *
   * Note: This is a soft delete in Square (archived, not permanently removed)
   */
  async deleteItem(squareItemId: string): Promise<void> {
    await this.client.catalog.object.delete({
      objectId: squareItemId,
    });
  }

  /**
   * List all catalog items (ITEM type only)
   *
   * Returns all items in the catalog for syncing with Firestore.
   */
  async listItems(): Promise<Square.CatalogObject[]> {
    const items: Square.CatalogObject[] = [];

    // The Square SDK returns an async iterable Page object
    const pager = await this.client.catalog.list({
      types: 'ITEM',
    });

    for await (const item of pager) {
      items.push(item);
    }

    return items;
  }

  /**
   * Upload an image to Square and attach it to a catalog item
   *
   * Uses the CreateCatalogImage endpoint which handles multipart/form-data.
   * Square hosts the image and returns a public URL.
   *
   * @see https://developer.squareup.com/docs/catalog-api/upload-and-attach-images
   */
  async uploadImage(input: UploadCatalogImageInput): Promise<UploadCatalogImageResult> {
    const idempotencyKey = `image-${input.squareItemId}-${Date.now()}`;
    const tempImageId = `#image-${Date.now()}`;

    const response = await this.client.catalog.images.create({
      request: {
        idempotencyKey,
        objectId: input.squareItemId,
        isPrimary: input.isPrimary ?? true,
        image: {
          type: 'IMAGE',
          id: tempImageId,
          imageData: {
            name: input.filename,
            caption: input.caption,
          },
        },
      },
      imageFile: input.imageBlob,
    });

    // Check for errors
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square image upload error: ${errorMessages}`);
    }

    const imageObject = response.image;
    // Type guard: check if it's an IMAGE type with imageData
    if (!imageObject || imageObject.type !== 'IMAGE') {
      console.error('Square image upload response:', JSON.stringify(response, null, 2));
      throw new Error('Failed to upload image: no image object in response');
    }

    // Now TypeScript knows imageObject is CatalogObject.Image
    const imageData = imageObject.imageData;
    if (!imageData?.url) {
      console.error('Square image upload response:', JSON.stringify(response, null, 2));
      throw new Error('Failed to upload image: no image URL in response');
    }

    // Fetch the updated item to get the new catalog version
    // Uploading an image changes the catalog version, so we need to return the new version
    const updatedItem = await this.getItem(input.squareItemId);
    const newCatalogVersion = Number(updatedItem?.version || 0);

    return {
      squareImageId: imageObject.id!,
      imageUrl: imageData.url,
      squareCatalogVersion: newCatalogVersion,
    };
  }

  /**
   * Get the primary image URL for a catalog item
   *
   * Returns null if the item has no images.
   */
  async getItemImageUrl(squareItemId: string): Promise<string | null> {
    const item = await this.getItem(squareItemId);
    // Type guard: check if it's an ITEM type
    if (!item || item.type !== 'ITEM') {
      return null;
    }

    const imageIds = item.itemData?.imageIds;
    if (!imageIds || imageIds.length === 0) {
      return null;
    }

    // Get the first (primary) image
    const imageId = imageIds[0];
    try {
      const imageResponse = await this.client.catalog.object.get({
        objectId: imageId,
      });
      const imageObj = imageResponse.object;
      // Type guard: check if it's an IMAGE type
      if (imageObj?.type === 'IMAGE') {
        return imageObj.imageData?.url || null;
      }
      return null;
    } catch {
      return null;
    }
  }
}
