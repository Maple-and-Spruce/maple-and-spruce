/**
 * List Etsy Listings Cloud Function
 *
 * Reads the connected shop's listings from Etsy and cross-references them
 * with Firestore Products (via Product.etsyListingId) so the admin UI can
 * show which listings have already been imported and which are available.
 *
 * Read-only: no writes to Etsy or Firestore. This is the browsing half of
 * the import flow; actual imports go through importEtsyListings.
 *
 * Admin only. Lives in the maple-core codebase since it has no Square dep.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  FirestoreTokenStorage,
  ProductRepository,
} from '@maple/firebase/database';
import { EtsyClient } from '@maple/firebase/etsy';
import type {
  ListEtsyListingsRequest,
  ListEtsyListingsResponse,
  EtsyListingWithSyncInfo,
} from '@maple/ts/firebase/api-types';

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

export const listEtsyListings = Functions.endpoint
  .usingSecrets(...ETSY_SECRET_NAMES)
  .usingStrings(...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<ListEtsyListingsRequest, ListEtsyListingsResponse>(
    async (data, _context, secrets, strings) => {
      const state = data.state ?? 'active';
      const limit = data.limit ?? 100;
      const offset = data.offset ?? 0;

      const client = new EtsyClient({
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        tokenStorage: FirestoreTokenStorage,
        redirectUri: strings.ETSY_REDIRECT_URI,
      });

      const page = await client.listings.getListings(state, {
        limit,
        offset,
        includes: 'Images,Inventory',
      });

      const listingIds = page.results.map((l) => String(l.listing_id));
      const existingProducts =
        await ProductRepository.findByEtsyListingIds(listingIds);

      // Map Etsy listing_id → Product for O(1) lookup during the zip below.
      const productByListingId = new Map(
        existingProducts
          .filter((p) => p.etsyListingId)
          .map((p) => [p.etsyListingId!, p])
      );

      const listings: EtsyListingWithSyncInfo[] = page.results.map(
        (listing) => {
          const variantCount = listing.inventory?.products?.length ?? 1;
          const product = productByListingId.get(String(listing.listing_id));
          return {
            listing,
            imported: product !== undefined,
            productId: product?.id,
            variantCount,
            isSimple: true,
          };
        }
      );

      return {
        listings,
        total: page.count,
      };
    }
  );
