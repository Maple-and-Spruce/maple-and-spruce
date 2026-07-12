/**
 * Process Catalog Sync Request
 *
 * Firestore-triggered worker for the singleton `catalogSyncRequests/
 * pending` doc. The Square webhook (`squareWebhook`) records each
 * `catalog.version.updated` event by bumping `requestedAt` on this
 * doc; this trigger drains the request asynchronously so the webhook
 * itself can ack inside Square's 10-second timeout.
 *
 * Coordination is lease-based via
 * `CatalogSyncRequestRepository.tryClaimLease()`:
 *
 * - A burst of N webhook events upserts the doc N times, firing this
 *   trigger N times. Only the first claim succeeds; the rest exit fast.
 * - On completion, the running=false write re-fires the trigger. If
 *   new requests arrived during the sync (requestedAt > processedAt
 *   at that moment), the next invocation runs a single catch-up sync.
 *   Otherwise it exits.
 *
 * The actual sync mirrors what the old inline webhook handler did:
 * fetch all tracked products + all Square catalog items, then update
 * existing products and create drafts for new items. Image-URL fetches
 * are parallelized so the wall time scales with Square's rate limits,
 * not with catalog size.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  CatalogSyncRequestRepository,
  ClassRepository,
  ProductRepository,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';

const squareSecretParams = SQUARE_SECRET_NAMES.map((name) => defineSecret(name));
const squareStringParams = SQUARE_STRING_NAMES.map((name) => defineString(name));

/** Concurrency cap on parallel image-URL fetches against Square. */
const IMAGE_FETCH_CONCURRENCY = 8;

interface SyncSummary {
  scanned: number;
  updated: number;
  created: number;
  skipped: number;
}

async function fetchImageUrl(
  squareItemId: string,
  square: Square
): Promise<string | undefined> {
  try {
    const imageUrl = await square.catalogService.getItemImageUrl(squareItemId);
    return imageUrl || undefined;
  } catch (err) {
    console.warn(`[process-catalog-sync] image fetch failed for ${squareItemId}:`, err);
    return undefined;
  }
}

/**
 * Run image-URL fetches in batches of N concurrent. Returns a Map keyed
 * by Square item id so callers can look up results without re-running.
 */
async function fetchImageUrlsConcurrent(
  squareItemIds: string[],
  square: Square
): Promise<Map<string, string | undefined>> {
  const out = new Map<string, string | undefined>();
  for (let i = 0; i < squareItemIds.length; i += IMAGE_FETCH_CONCURRENCY) {
    const chunk = squareItemIds.slice(i, i + IMAGE_FETCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((id) => fetchImageUrl(id, square))
    );
    chunk.forEach((id, idx) => out.set(id, results[idx]));
  }
  return out;
}

async function runCatalogSync(square: Square): Promise<SyncSummary> {
  const products = await ProductRepository.findAll();
  const trackedSquareItemIds = new Set(
    products.filter((p) => p.squareItemId).map((p) => p.squareItemId!)
  );

  // Square catalog items that are actually class mirrors (pushed by
  // syncClassToSquare). These must NOT be reflected back into the Products
  // collection — otherwise every published class would spawn a phantom
  // `status:'draft'` Product here. Skip them entirely (neither update nor
  // create). Sourced from findAll() + filter to avoid a composite index.
  const classCatalogItemIds = new Set(
    await ClassRepository.listSquareCatalogItemIds()
  );

  const squareItems = await square.catalogService.listItems();

  console.log(
    `[process-catalog-sync] firestore=${products.length} (tracked=${trackedSquareItemIds.size}) square=${squareItems.length}`
  );

  // Pre-fetch all image URLs in parallel before iterating.
  const itemIdsForImages = squareItems
    .filter((o) => o.type === 'ITEM' && o.id)
    .map((o) => o.id!);
  const imageUrls = await fetchImageUrlsConcurrent(itemIdsForImages, square);

  let updated = 0;
  let created = 0;
  let skipped = 0;

  for (const catalogObject of squareItems) {
    if (catalogObject.type !== 'ITEM' || !catalogObject.id) {
      skipped++;
      continue;
    }

    // Class catalog items are owned by syncClassToSquare. Skip them so this
    // worker never mirrors a class back as a phantom draft Product.
    if (classCatalogItemIds.has(catalogObject.id)) {
      skipped++;
      continue;
    }

    const itemData = catalogObject.itemData;
    const variation = itemData?.variations?.[0];
    const variationData = (variation as {
      itemVariationData?: {
        sku?: string;
        priceMoney?: { amount?: bigint };
      };
    })?.itemVariationData;

    const imageUrl = imageUrls.get(catalogObject.id);

    if (trackedSquareItemIds.has(catalogObject.id)) {
      const product = products.find((p) => p.squareItemId === catalogObject.id);
      if (!product) {
        skipped++;
        continue;
      }
      try {
        await ProductRepository.updateSquareCache(
          product.id,
          {
            name: itemData?.name ?? product.squareCache.name,
            description:
              itemData?.description ?? product.squareCache.description,
            priceCents: variationData?.priceMoney?.amount
              ? Number(variationData.priceMoney.amount)
              : product.squareCache.priceCents,
            sku: variationData?.sku ?? product.squareCache.sku,
            imageUrl: imageUrl ?? product.squareCache.imageUrl,
          },
          Number(catalogObject.version || 0)
        );
        updated++;
      } catch (err) {
        console.warn(
          `[process-catalog-sync] update failed for ${product.id}:`,
          err
        );
        skipped++;
      }
      continue;
    }

    // New item in Square — create a draft (artistId left blank for manual assignment).
    if (!variation) {
      skipped++;
      continue;
    }
    try {
      const newProduct = await ProductRepository.create(
        {
          artistId: '',
          name: itemData?.name ?? 'Unnamed Product',
          description: itemData?.description ?? undefined,
          priceCents: variationData?.priceMoney?.amount
            ? Number(variationData.priceMoney.amount)
            : 0,
          quantity: 0,
          status: 'draft',
        },
        {
          squareItemId: catalogObject.id,
          squareVariationId: variation.id!,
          squareCatalogVersion: Number(catalogObject.version || 0),
          squareLocationId: square.locationId,
          sku: variationData?.sku ?? '',
          variations: [
            {
              variantId: 'var_compat',
              squareVariationId: variation.id!,
              sku: variationData?.sku ?? '',
            },
          ],
        }
      );
      if (imageUrl) {
        await ProductRepository.updateSquareCache(newProduct.id, { imageUrl });
      }
      created++;
    } catch (err) {
      console.warn(
        `[process-catalog-sync] create failed for Square item ${catalogObject.id}:`,
        err
      );
      skipped++;
    }
  }

  return { scanned: squareItems.length, updated, created, skipped };
}

export const processCatalogSyncRequest = onDocumentWritten(
  {
    document: 'catalogSyncRequests/pending',
    region: 'us-east4',
    memory: '512MiB',
    // Long timeout: this can take a few minutes on a large catalog. Square
    // doesn't wait on this — only the webhook ack matters.
    timeoutSeconds: 540,
    secrets: squareSecretParams,
  },
  async (event) => {
    const after = event.data?.after.data();
    if (!after) {
      // Doc deleted — nothing to do.
      return;
    }

    // Cheap pre-check before opening a transaction. Lease in-flight or
    // nothing new to process → exit fast.
    const cur = await CatalogSyncRequestRepository.getCurrent();
    if (
      cur.processedAt &&
      cur.requestedAt &&
      cur.processedAt.getTime() >= cur.requestedAt.getTime()
    ) {
      return;
    }

    const claimed = await CatalogSyncRequestRepository.tryClaimLease();
    if (!claimed) {
      // Either another invocation grabbed the lease, or there's nothing
      // to do. Either way, this trigger is done.
      return;
    }

    const secrets = Object.fromEntries(
      squareSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      squareStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_STRING_NAMES)[number], string>;

    const square = new Square(secrets, strings);

    try {
      const summary = await runCatalogSync(square);
      const details = `scanned ${summary.scanned}, updated ${summary.updated}, created ${summary.created}, skipped ${summary.skipped}`;
      await CatalogSyncRequestRepository.markCompleted(details);
      console.log(`[process-catalog-sync] done: ${details}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[process-catalog-sync] sync failed:', message);
      await CatalogSyncRequestRepository.markFailed(message);
      // Re-throw so the function reports failure to Cloud Functions logs.
      throw err;
    }
  }
);
