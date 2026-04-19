/**
 * Import Etsy Listings Cloud Function
 *
 * Bulk-imports selected Etsy listings into our Product catalog as a
 * read-only pull (no writes to Etsy). For each selected listing:
 *   1. Fetch the full listing (+ images + inventory) from Etsy.
 *   2. Skip multi-variant listings (not supported in this pass).
 *   3. Skip listings already linked to a Product (idempotent re-runs).
 *   4. Create a Square catalog item with the listing's name/price.
 *   5. Set initial Square inventory quantity from the listing.
 *   6. Best-effort: download the primary Etsy image and attach it to the
 *      Square catalog item so the image shows up in our normal product UI.
 *   7. Create the Firestore Product linking Square + Etsy, with caches.
 *   8. Persist the raw Etsy listing+inventory to `etsy-imports/{productId}`
 *      so we can mine it later for template seeding and insights.
 *
 * Every row's outcome is reported back independently so the UI can show
 * per-row success/failure without aborting the whole batch.
 *
 * Admin only. Lives in the functions-square codebase since each import
 * calls Square catalog + inventory APIs.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  FirestoreTokenStorage,
  ProductRepository,
  EtsyImportRepository,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import {
  EtsyClient,
  EtsyHttpError,
  type EtsyListing,
  type EtsyListingImage,
} from '@maple/firebase/etsy';
import type {
  ImportEtsyListingsRequest,
  ImportEtsyListingsResponse,
  ImportEtsyListingResult,
} from '@maple/ts/firebase/api-types';
import type { Product } from '@maple/ts/domain';

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

type EtsyRaw = Record<string, unknown>;

/**
 * Convert Etsy's {amount, divisor, currency_code} money shape to cents.
 * Etsy's divisor is almost always 100 (so amount is already in cents), but
 * the math here makes no assumption and handles any divisor correctly.
 */
function etsyPriceToCents(price: EtsyListing['price']): number {
  if (!price || typeof price.amount !== 'number' || !price.divisor) return 0;
  return Math.round((price.amount / price.divisor) * 100);
}

/**
 * Pick the primary listing image (lowest rank), preferring the largest URL.
 */
function pickPrimaryImageUrl(
  images: EtsyListingImage[] | undefined
): string | undefined {
  if (!images || images.length === 0) return undefined;
  const sorted = [...images].sort((a, b) => a.rank - b.rank);
  const primary = sorted[0];
  return primary.url_fullxfull ?? primary.url_570xN ?? primary.url_170x135;
}

/**
 * Download an image URL and upload it to the Square catalog item.
 * Best-effort: failure is logged and swallowed so the product still imports.
 */
async function tryAttachImageToSquare(
  square: Square,
  squareItemId: string,
  imageUrl: string | undefined
): Promise<number | undefined> {
  if (!imageUrl) return undefined;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(
        `Failed to download Etsy image (${response.status}): ${imageUrl}`
      );
      return undefined;
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType =
      response.headers.get('content-type') ?? 'image/jpeg';
    const blob = new Blob([arrayBuffer], { type: contentType });
    const ext = contentType.split('/')[1] ?? 'jpg';
    const uploaded = await square.catalogService.uploadImage({
      squareItemId,
      imageBlob: blob,
      filename: `etsy-import.${ext}`,
      isPrimary: true,
    });
    return uploaded.squareCatalogVersion;
  } catch (err) {
    console.warn('Failed to attach Etsy image to Square:', err);
    return undefined;
  }
}

/**
 * Import a single Etsy listing. Returns a per-row result; never throws.
 */
async function importSingleListing(options: {
  listingId: string;
  artistId: string;
  categoryId?: string;
  status: ImportEtsyListingsRequest['status'];
  customCommissionRate?: number;
  client: EtsyClient;
  square: Square;
  importedBy: string;
}): Promise<ImportEtsyListingResult> {
  const {
    listingId,
    artistId,
    categoryId,
    status,
    customCommissionRate,
    client,
    square,
    importedBy,
  } = options;

  try {
    // Short-circuit on already-imported so we don't even hit Etsy.
    const existing = await ProductRepository.findByEtsyListingId(listingId);
    if (existing) {
      return {
        listingId,
        success: false,
        error: `Listing ${listingId} is already linked to product ${existing.id}`,
        errorCode: 'ALREADY_IMPORTED',
        productId: existing.id,
      };
    }

    let listing: EtsyListing;
    try {
      listing = await client.listings.getListing(
        Number(listingId),
        'Images,Inventory'
      );
    } catch (err) {
      if (err instanceof EtsyHttpError && err.status === 404) {
        return {
          listingId,
          success: false,
          error: `Listing ${listingId} not found on Etsy`,
          errorCode: 'LISTING_NOT_FOUND',
        };
      }
      throw err;
    }

    const variantCount = listing.inventory?.products?.length ?? 1;
    if (variantCount > 1) {
      return {
        listingId,
        success: false,
        error: `Listing has ${variantCount} variants; multi-variant imports are not yet supported`,
        errorCode: 'MULTI_VARIANT_NOT_SUPPORTED',
      };
    }

    const priceCents = etsyPriceToCents(listing.price);
    const quantity = listing.quantity ?? 0;
    const etsySku = listing.inventory?.products?.[0]?.sku || undefined;

    // 1. Create Square catalog item
    let catalogResult;
    try {
      catalogResult = await square.catalogService.createItem({
        name: listing.title,
        description: listing.description,
        priceCents,
        sku: etsySku,
      });
    } catch (err) {
      return {
        listingId,
        success: false,
        error: `Square catalog create failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        errorCode: 'SQUARE_CREATE_FAILED',
      };
    }

    // 2. Set Square inventory quantity (non-fatal if this fails — we still
    //    have a valid catalog item and Product link; the admin can fix qty.)
    if (quantity > 0) {
      try {
        await square.inventoryService.setQuantity({
          squareVariationId: catalogResult.squareVariationId,
          locationId: square.locationId,
          quantity,
        });
      } catch (err) {
        console.warn(
          `Failed to set initial inventory for listing ${listingId}:`,
          err
        );
      }
    }

    // 3. Best-effort: attach primary Etsy image to the Square item so it
    //    shows up in our normal product UI.
    const imageUrl = pickPrimaryImageUrl(listing.images);
    const newCatalogVersion = await tryAttachImageToSquare(
      square,
      catalogResult.squareItemId,
      imageUrl
    );

    // 4. Create Firestore Product
    const product = await ProductRepository.create(
      {
        artistId,
        categoryId,
        customCommissionRate,
        status,
        name: listing.title,
        description: listing.description,
        priceCents,
        quantity,
      },
      {
        squareItemId: catalogResult.squareItemId,
        squareVariationId: catalogResult.squareVariationId,
        squareCatalogVersion:
          newCatalogVersion ?? catalogResult.squareCatalogVersion,
        squareLocationId: square.locationId,
        sku: catalogResult.sku,
        variations: [{ variantId: 'var_compat', squareVariationId: catalogResult.squareVariationId, sku: catalogResult.sku }],
      }
    );

    // 5. Link Etsy listing + populate etsyCache
    await ProductRepository.updateEtsyCache(product.id, listingId, {
      title: listing.title,
      description: listing.description,
      priceCents,
      quantity,
      url: listing.url,
      taxonomyId: listing.taxonomy_id,
      tags: listing.tags,
      state:
        listing.state === 'active' || listing.state === 'draft'
          ? listing.state
          : 'inactive',
      syncedAt: new Date(),
    });

    // 6. Persist raw snapshot for later insights / template seeding
    await EtsyImportRepository.create({
      productId: product.id,
      listingId,
      rawListing: listing as unknown as EtsyRaw,
      rawInventory: listing.inventory as unknown as EtsyRaw | undefined,
      variantCount,
      importedBy,
    });

    // Refetch to return the Product with populated etsyCache.
    const refreshed = (await ProductRepository.findById(product.id)) as Product;

    return {
      listingId,
      success: true,
      productId: product.id,
      product: refreshed,
    };
  } catch (err) {
    console.error(`Failed to import Etsy listing ${listingId}:`, err);
    return {
      listingId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: 'INTERNAL_ERROR',
    };
  }
}

export const importEtsyListings = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES, ...ETSY_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES, ...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<ImportEtsyListingsRequest, ImportEtsyListingsResponse>(
    async (data, context, secrets, strings) => {
      if (!data.listings || data.listings.length === 0) {
        return { results: [], successCount: 0, failureCount: 0 };
      }
      if (!data.artistId) {
        throw new Error('artistId is required for bulk Etsy import');
      }

      const client = new EtsyClient({
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        tokenStorage: FirestoreTokenStorage,
        redirectUri: strings.ETSY_REDIRECT_URI,
      });

      const square = new Square(
        secrets as typeof secrets &
          Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
        strings as typeof strings &
          Record<(typeof SQUARE_STRING_NAMES)[number], string>
      );

      const importedBy = context?.uid ?? 'system';

      // Sequential, not parallel: Square rate-limits, and parallel runs
      // would also make error logs harder to interpret. The admin UI
      // already warns that bulk import is not instant.
      const results: ImportEtsyListingResult[] = [];
      for (const { listingId } of data.listings) {
        const result = await importSingleListing({
          listingId,
          artistId: data.artistId,
          categoryId: data.categoryId,
          status: data.status,
          customCommissionRate: data.customCommissionRate,
          client,
          square,
          importedBy,
        });
        results.push(result);
      }

      const successCount = results.filter((r) => r.success).length;
      return {
        results,
        successCount,
        failureCount: results.length - successCount,
      };
    }
  );
