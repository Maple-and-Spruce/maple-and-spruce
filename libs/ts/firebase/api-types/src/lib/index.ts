/**
 * API Types library
 *
 * Request and response types for Firebase Cloud Functions.
 * These are shared between client and server for type-safe API calls.
 *
 * @example
 * // Client-side usage
 * import { CreateArtistRequest, CreateArtistResponse } from '@maple/ts/firebase/api-types';
 * import { httpsCallable } from 'firebase/functions';
 *
 * const createArtist = httpsCallable<CreateArtistRequest, CreateArtistResponse>(
 *   functions,
 *   'createArtist'
 * );
 * const result = await createArtist({ name: 'John', email: 'john@example.com', ... });
 *
 * @example
 * // Server-side usage
 * import { CreateArtistRequest, CreateArtistResponse } from '@maple/ts/firebase/api-types';
 * import { createAdminFunction } from '@maple/firebase/functions';
 *
 * export const createArtist = createAdminFunction<CreateArtistRequest, CreateArtistResponse>(
 *   async (data, context) => {
 *     // data is typed as CreateArtistRequest
 *     const artist = await ArtistRepository.create(data);
 *     return { artist }; // return type is CreateArtistResponse
 *   }
 * );
 */

// Artist types
export type {
  GetArtistsRequest,
  GetArtistsResponse,
  GetArtistRequest,
  GetArtistResponse,
  CreateArtistRequest,
  CreateArtistResponse,
  UpdateArtistRequest,
  UpdateArtistResponse,
  DeleteArtistRequest,
  DeleteArtistResponse,
  UploadArtistImageRequest,
  UploadArtistImageResponse,
} from './artist.types';

// Product types
export type {
  GetProductsRequest,
  GetProductsResponse,
  GetProductRequest,
  GetProductResponse,
  CreateProductRequest,
  CreateProductResponse,
  UpdateProductRequest,
  UpdateProductResponse,
  DeleteProductRequest,
  DeleteProductResponse,
  UploadProductImageRequest,
  UploadProductImageResponse,
  SyncEtsyProductsRequest,
  SyncEtsyProductsResponse,
} from './product.types';

// Sale types
export type {
  GetSalesRequest,
  GetSalesResponse,
  GetSaleRequest,
  GetSaleResponse,
  RecordSaleRequest,
  RecordSaleResponse,
  RecordProductSaleRequest,
  RecordProductSaleResponse,
  SyncEtsySalesRequest,
  SyncEtsySalesResponse,
} from './sale.types';

// Payout types
export type {
  GetPayoutsRequest,
  GetPayoutsResponse,
  GetPayoutRequest,
  GetPayoutResponse,
  GeneratePayoutRequest,
  GeneratePayoutResponse,
  PreviewPayoutRequest,
  PreviewPayoutResponse,
  MarkPayoutPaidRequest,
  MarkPayoutPaidResponse,
  GetArtistPayoutSummaryRequest,
  GetArtistPayoutSummaryResponse,
} from './payout.types';
