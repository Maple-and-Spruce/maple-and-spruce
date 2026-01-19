/**
 * Square Catalog API service
 *
 * Handles creating, updating, and retrieving catalog items in Square.
 * Products in our system map to Square CatalogItems with CatalogItemVariations.
 *
 * @see https://developer.squareup.com/docs/catalog-api/what-it-does
 */
import { SquareClient, Square } from 'square';
import { generateSku } from '@maple/ts/domain';

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
 * Input for creating a catalog item
 */
export interface CreateCatalogItemInput {
  /** Product name */
  name: string;
  /** Product description */
  description?: string;
  /** Price in cents (e.g., 2500 = $25.00) */
  priceCents: number;
  /** Initial quantity (optional, set via Inventory API) */
  quantity?: number;
  /** SKU - if not provided, one will be generated */
  sku?: string;
}

/**
 * Result of creating a catalog item
 */
export interface CreateCatalogItemResult {
  /** Square catalog item ID */
  squareItemId: string;
  /** Square item variation ID (for inventory tracking) */
  squareVariationId: string;
  /** Square catalog version (for optimistic locking) */
  squareCatalogVersion: number;
  /** The generated or provided SKU */
  sku: string;
}

/**
 * Input for updating a catalog item
 */
export interface UpdateCatalogItemInput {
  /** Square catalog item ID */
  squareItemId: string;
  /** Square item variation ID */
  squareVariationId: string;
  /** Current catalog version (for optimistic locking) */
  squareCatalogVersion: number;
  /** Updated name (optional) */
  name?: string;
  /** Updated description (optional) */
  description?: string;
  /** Updated price in cents (optional) */
  priceCents?: number;
  /** Updated SKU (optional) */
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
   * Create a new catalog item with a single variation
   *
   * Square uses a hierarchical model:
   * - CatalogItem: The product (name, description)
   * - CatalogItemVariation: The purchasable unit (price, SKU)
   *
   * For our consignment model, each product has exactly one variation.
   */
  async createItem(input: CreateCatalogItemInput): Promise<CreateCatalogItemResult> {
    const sku = input.sku || generateSku();
    const idempotencyKey = `create-${sku}-${Date.now()}`;

    // Generate temporary IDs for the batch upsert
    const itemId = `#item-${sku}`;
    const variationId = `#variation-${sku}`;

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
                variations: [
                  {
                    type: 'ITEM_VARIATION',
                    id: variationId,
                    itemVariationData: {
                      name: 'Regular',
                      sku: sku,
                      pricingType: 'FIXED_PRICING',
                      priceMoney: {
                        amount: BigInt(input.priceCents),
                        currency: 'USD',
                      },
                      trackInventory: true,
                    },
                  },
                ],
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

    // The variation is nested inside the item's itemData.variations array
    const variations = itemObject.itemData?.variations || [];
    const variationObject = variations[0];

    if (!variationObject) {
      console.error(
        'Square batchUpsert itemObject:',
        JSON.stringify(itemObject, null, 2)
      );
      throw new Error(
        'Failed to create catalog item: no variation in ITEM response'
      );
    }

    return {
      squareItemId: itemObject.id!,
      squareVariationId: variationObject.id!,
      squareCatalogVersion: Number(itemObject.version || 0),
      sku,
    };
  }

  /**
   * Update an existing catalog item
   *
   * Uses optimistic locking via catalog version to prevent conflicts.
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

    // Find the variation - could be in relatedObjects OR nested in itemData.variations
    const relatedObjects = currentResponse.relatedObjects || [];
    let variation = relatedObjects.find(
      (obj: Square.CatalogObject) => obj.id === input.squareVariationId
    );

    // If not in relatedObjects, check the nested variations array
    if (!variation) {
      const nestedVariations = currentItem.itemData?.variations || [];
      variation = nestedVariations.find(
        (v) => v.id === input.squareVariationId
      ) as Square.CatalogObject | undefined;
    }

    if (!variation || variation.type !== 'ITEM_VARIATION') {
      throw new Error(`Catalog variation not found: ${input.squareVariationId}`);
    }

    // Build updated variation data
    const currentVariationData = variation.itemVariationData;
    const updatedVariationData: Square.CatalogItemVariation = {
      ...currentVariationData,
      itemId: input.squareItemId,
      sku: input.sku ?? currentVariationData?.sku,
      priceMoney: input.priceCents !== undefined
        ? {
            amount: BigInt(input.priceCents),
            currency: 'USD',
          }
        : currentVariationData?.priceMoney,
    };

    // Build the updated variation object to nest inside the item
    const updatedVariation: Square.CatalogObject = {
      type: 'ITEM_VARIATION',
      id: input.squareVariationId,
      version: variation.version,
      itemVariationData: updatedVariationData,
    };

    // Build updated item data with the variation nested inside
    // Square expects variations to be nested in the item, not as separate batch objects
    const updatedItemData: Square.CatalogItem = {
      ...currentItem.itemData,
      name: input.name ?? currentItem.itemData?.name,
      description: input.description ?? currentItem.itemData?.description,
      variations: [updatedVariation],
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
