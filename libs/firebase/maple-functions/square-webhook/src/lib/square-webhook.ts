/**
 * Square Webhook Handler
 *
 * Handles incoming webhooks from Square for:
 * - catalog.version.updated: Item created/updated in Square
 * - inventory.count.updated: Inventory quantity changed
 *
 * Webhooks allow us to sync changes made directly in Square
 * (POS, Dashboard) back to our Firestore records.
 *
 * With separate Firebase projects, each project has its own webhook signature key:
 * - maple-and-spruce-dev: sandbox webhook signature key
 * - maple-and-spruce: production webhook signature key
 *
 * @see https://developer.squareup.com/docs/webhooks/overview
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createHmac } from 'crypto';
import { ProductRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';

// Webhook signature secret - per-project, no _PROD suffix needed
const SQUARE_WEBHOOK_SIGNATURE_KEY = defineSecret('SQUARE_WEBHOOK_SIGNATURE_KEY');

// Also need the regular Square secrets for API calls
const squareSecrets = SQUARE_SECRET_NAMES.map((name) => defineSecret(name));
const squareStrings = SQUARE_STRING_NAMES.map((name) => defineString(name));

// Webhook event types we handle
type WebhookEventType =
  | 'catalog.version.updated'
  | 'inventory.count.updated';

interface WebhookEvent {
  merchant_id: string;
  type: WebhookEventType;
  event_id: string;
  created_at: string;
  data: {
    type: string;
    id: string;
    object?: Record<string, unknown>;
  };
}

/**
 * Verify Square webhook signature
 *
 * @see https://developer.squareup.com/docs/webhooks/step3validate
 */
function verifySignature(
  body: string,
  signature: string | undefined,
  signatureKey: string,
  webhookUrl: string
): boolean {
  if (!signature) {
    console.warn('No signature provided in webhook request');
    return false;
  }

  // Square signature format: webhookUrl + body, HMAC-SHA256, base64
  const stringToSign = webhookUrl + body;
  const expectedSignature = createHmac('sha256', signatureKey)
    .update(stringToSign)
    .digest('base64');

  return signature === expectedSignature;
}

/**
 * Extract the primary image URL from a catalog item
 *
 * Images are stored as separate CatalogImage objects referenced by imageIds.
 * We fetch the first (primary) image to get its URL.
 */
async function extractImageUrl(
  squareItemId: string,
  square: Square
): Promise<string | undefined> {
  try {
    const imageUrl = await square.catalogService.getItemImageUrl(squareItemId);
    return imageUrl || undefined;
  } catch (err) {
    console.warn('Failed to fetch image URL:', err);
    return undefined;
  }
}

/**
 * Handle catalog.version.updated webhook
 *
 * Fired when a catalog item is created or updated in Square.
 * We need to sync the changes to our Firestore record.
 */
async function handleCatalogUpdate(
  event: WebhookEvent,
  square: Square
): Promise<{ action: string; details: string }> {
  const catalogObjectId = event.data.id;

  // catalog.version.updated events don't include a specific item ID
  // They notify that the catalog version changed (batch update)
  // We need to refresh all tracked products AND discover new ones
  if (!catalogObjectId) {
    console.log('Batch catalog update - syncing all items from Square');

    // Fetch all products we track
    const products = await ProductRepository.findAll();
    const trackedSquareItemIds = new Set(
      products.filter(p => p.squareItemId).map(p => p.squareItemId!)
    );

    console.log(`Found ${products.length} products in Firestore, ${trackedSquareItemIds.size} with Square IDs`);

    // Fetch all items from Square catalog
    const squareItems = await square.catalogService.listItems();
    console.log(`Found ${squareItems.length} items in Square catalog`);

    let updatedCount = 0;
    let createdCount = 0;

    for (const catalogObject of squareItems) {
      if (catalogObject.type !== 'ITEM' || !catalogObject.id) {
        continue;
      }

      const itemData = catalogObject.itemData;
      const variation = itemData?.variations?.[0];
      const variationData = (variation as { itemVariationData?: {
        sku?: string;
        priceMoney?: { amount?: bigint };
      } })?.itemVariationData;

      // Extract image URL from catalog item
      const imageUrl = catalogObject.id ? await extractImageUrl(catalogObject.id, square) : undefined;

      if (trackedSquareItemIds.has(catalogObject.id)) {
        // Update existing product
        const product = products.find(p => p.squareItemId === catalogObject.id);
        if (product) {
          try {
            await ProductRepository.updateSquareCache(
              product.id,
              {
                name: itemData?.name ?? product.squareCache.name,
                description: itemData?.description ?? product.squareCache.description,
                priceCents: variationData?.priceMoney?.amount
                  ? Number(variationData.priceMoney.amount)
                  : product.squareCache.priceCents,
                sku: variationData?.sku ?? product.squareCache.sku,
                imageUrl: imageUrl ?? product.squareCache.imageUrl,
              },
              Number(catalogObject.version || 0)
            );
            updatedCount++;
          } catch (err) {
            console.warn(`Failed to refresh product ${product.id}:`, err);
          }
        }
      } else {
        // Create new product from Square item
        if (!variation) {
          console.warn(`Skipping Square item ${catalogObject.id} - no variation`);
          continue;
        }

        try {
          const newProduct = await ProductRepository.create(
            {
              artistId: '', // Needs to be assigned manually
              name: itemData?.name ?? 'Unnamed Product',
              description: itemData?.description ?? undefined,
              priceCents: variationData?.priceMoney?.amount
                ? Number(variationData.priceMoney.amount)
                : 0,
              quantity: 0, // Will be updated by inventory webhook
              status: 'draft', // Draft until artist is assigned
            },
            {
              squareItemId: catalogObject.id,
              squareVariationId: variation.id!,
              squareCatalogVersion: Number(catalogObject.version || 0),
              squareLocationId: square.locationId,
              sku: variationData?.sku ?? '',
            }
          );
          // Update image URL if available (create doesn't support imageUrl directly)
          if (imageUrl) {
            await ProductRepository.updateSquareCache(newProduct.id, { imageUrl });
          }
          console.log(`Created new product ${newProduct.id} from Square item ${catalogObject.id}`);
          createdCount++;
        } catch (err) {
          console.warn(`Failed to create product from Square item ${catalogObject.id}:`, err);
        }
      }
    }

    return {
      action: 'synced',
      details: `Synced catalog: updated ${updatedCount}, created ${createdCount} from ${squareItems.length} Square items`,
    };
  }

  // Fetch the full catalog object from Square
  const catalogObject = await square.catalogService.getItem(catalogObjectId);

  if (!catalogObject) {
    return {
      action: 'skipped',
      details: `Catalog object ${catalogObjectId} not found in Square (may have been deleted)`,
    };
  }

  // Only handle ITEM types (not categories, taxes, etc.)
  if (catalogObject.type !== 'ITEM') {
    return {
      action: 'skipped',
      details: `Skipping non-ITEM catalog object type: ${catalogObject.type}`,
    };
  }

  // Check if we have this item in Firestore
  const existingProduct = await ProductRepository.findBySquareItemId(catalogObjectId);

  // Extract variation data - it's nested as CatalogObject with itemVariationData
  const itemData = catalogObject.itemData;
  const variation = itemData?.variations?.[0];
  // Access itemVariationData from the variation object (typed as CatalogObject but has this property)
  const variationData = (variation as { itemVariationData?: {
    sku?: string;
    priceMoney?: { amount?: bigint };
  } })?.itemVariationData;

  // Extract image URL from catalog item
  const imageUrl = catalogObject.id ? await extractImageUrl(catalogObject.id, square) : undefined;

  if (existingProduct) {
    // Update existing product's cache
    await ProductRepository.updateSquareCache(
      existingProduct.id,
      {
        name: itemData?.name ?? existingProduct.squareCache.name,
        description: itemData?.description ?? existingProduct.squareCache.description,
        priceCents: variationData?.priceMoney?.amount
          ? Number(variationData.priceMoney.amount)
          : existingProduct.squareCache.priceCents,
        sku: variationData?.sku ?? existingProduct.squareCache.sku,
        imageUrl: imageUrl ?? existingProduct.squareCache.imageUrl,
      },
      Number(catalogObject.version || 0)
    );

    return {
      action: 'updated',
      details: `Updated product ${existingProduct.id} from Square item ${catalogObjectId}`,
    };
  } else {
    // New item created in Square - create a placeholder in Firestore
    // Note: This won't have an artistId, so it will need to be assigned manually
    if (!variation) {
      return {
        action: 'skipped',
        details: `Catalog item ${catalogObjectId} has no variation`,
      };
    }

    // Create a draft product that needs artist assignment
    const product = await ProductRepository.create(
      {
        artistId: '', // Needs to be assigned manually
        name: itemData?.name ?? 'Unnamed Product',
        description: itemData?.description ?? undefined,
        priceCents: variationData?.priceMoney?.amount
          ? Number(variationData.priceMoney.amount)
          : 0,
        quantity: 0, // Will be updated by inventory webhook
        status: 'draft', // Draft until artist is assigned
      },
      {
        squareItemId: catalogObject.id!,
        squareVariationId: variation.id!,
        squareCatalogVersion: Number(catalogObject.version || 0),
        squareLocationId: square.locationId,
        sku: variationData?.sku ?? '',
      }
    );

    // Update image URL if available (create doesn't support imageUrl directly)
    if (imageUrl) {
      await ProductRepository.updateSquareCache(product.id, { imageUrl });
    }

    return {
      action: 'created',
      details: `Created draft product ${product.id} from Square item ${catalogObjectId} (needs artist assignment)`,
    };
  }
}

/**
 * Handle inventory.count.updated webhook
 *
 * Fired when inventory quantity changes in Square (sale, adjustment, etc.)
 */
async function handleInventoryUpdate(
  event: WebhookEvent
): Promise<{ action: string; details: string }> {
  // The event data contains the catalog object ID (variation)
  const inventoryCount = event.data.object as {
    catalog_object_id?: string;
    quantity?: string;
    location_id?: string;
  } | undefined;

  if (!inventoryCount?.catalog_object_id) {
    return {
      action: 'skipped',
      details: 'No catalog_object_id in inventory event',
    };
  }

  // Find the product by variation ID
  // Note: We store squareVariationId, not squareItemId for inventory
  const products = await ProductRepository.findAll();
  const product = products.find(
    (p) => p.squareVariationId === inventoryCount.catalog_object_id
  );

  if (!product) {
    return {
      action: 'skipped',
      details: `No product found for variation ${inventoryCount.catalog_object_id}`,
    };
  }

  const newQuantity = parseInt(inventoryCount.quantity || '0', 10);

  await ProductRepository.updateCachedQuantity(product.id, newQuantity);

  return {
    action: 'updated',
    details: `Updated quantity for product ${product.id} to ${newQuantity}`,
  };
}

/**
 * Square webhook endpoint
 *
 * Receives webhook events from Square and processes them.
 * Must be deployed and registered in Square Dashboard.
 *
 * Each Firebase project has its own webhook registered with Square:
 * - maple-and-spruce-dev: sandbox webhook
 * - maple-and-spruce: production webhook
 */
export const squareWebhook = onRequest(
  {
    region: 'us-east4',
    secrets: [
      SQUARE_WEBHOOK_SIGNATURE_KEY,
      ...squareSecrets,
    ],
  },
  async (request, response) => {
    // Only accept POST
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }

    try {
      // Get raw body for signature verification
      const rawBody = JSON.stringify(request.body);
      const signature = request.headers['x-square-hmacsha256-signature'] as string | undefined;

      // Get the webhook signature key - per-project, so no suffix selection needed
      const signatureKey = SQUARE_WEBHOOK_SIGNATURE_KEY.value();

      // Determine environment from string param (for logging)
      const squareEnv = squareStrings.find((s) => s.name === 'SQUARE_ENV')?.value() ?? 'LOCAL';
      const isProd = squareEnv === 'PROD';

      // Get the webhook URL (needed for signature verification)
      // Use the notification URL exactly as registered in Square Dashboard
      // This URL differs per project
      const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';
      const webhookUrl = `https://us-east4-${projectId}.cloudfunctions.net/squareWebhook`;

      console.log('Signature verification:', {
        receivedSignature: signature,
        webhookUrl,
        bodyLength: rawBody.length,
        isProd,
      });

      // Verify signature
      if (!verifySignature(rawBody, signature, signatureKey, webhookUrl)) {
        console.error('Webhook signature verification failed');
        response.status(401).send('Invalid signature');
        return;
      }

      const event = request.body as WebhookEvent;
      console.log(`Received Square webhook: ${event.type} (${event.event_id})`);

      // Build Square client for API calls
      const secrets = Object.fromEntries(
        squareSecrets.map((s) => [s.name, s.value()])
      ) as Record<(typeof SQUARE_SECRET_NAMES)[number], string>;

      const strings = Object.fromEntries(
        squareStrings.map((s) => [s.name, s.value()])
      ) as Record<(typeof SQUARE_STRING_NAMES)[number], string>;

      const square = new Square(secrets, strings);

      // Handle the event based on type
      let result: { action: string; details: string };

      switch (event.type) {
        case 'catalog.version.updated':
          result = await handleCatalogUpdate(event, square);
          break;

        case 'inventory.count.updated':
          result = await handleInventoryUpdate(event);
          break;

        default:
          result = {
            action: 'skipped',
            details: `Unhandled event type: ${event.type}`,
          };
      }

      console.log(`Webhook result: ${result.action} - ${result.details}`);

      // Always return 200 to acknowledge receipt (even for skipped events)
      // Square will retry if we return an error
      response.status(200).json({
        received: true,
        event_id: event.event_id,
        ...result,
      });
    } catch (error) {
      console.error('Webhook processing error:', error);

      // Return 500 so Square will retry
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  }
);
