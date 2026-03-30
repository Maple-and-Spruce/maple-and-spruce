// Main client
export { EtsyClient } from './lib/etsy.client.js';

// OAuth types and utilities
export { OAuthService } from './lib/oauth/oauth.service.js';
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from './lib/oauth/pkce.js';
export type {
  TokenStorage,
  TokenData,
  EtsyClientConfig,
  AuthUrlResult,
  TokenExchangeParams,
  EtsyTokenResponse,
} from './lib/oauth/types.js';

// HTTP layer
export { EtsyHttp, EtsyHttpError } from './lib/http/etsy-http.js';

// Services
export { ListingService } from './lib/services/listing.service.js';
export { InventoryService } from './lib/services/inventory.service.js';
export { TaxonomyService } from './lib/services/taxonomy.service.js';

// Listing types
export type {
  EtsyListing,
  EtsyListingImage,
  EtsyListingInventory,
  EtsyInventoryProduct,
  EtsyInventoryOffering,
  EtsyPropertyValue,
  CreateDraftListingInput,
  UpdateListingInput,
} from './lib/types/listing.types.js';

// Inventory types
export type {
  UpdateInventoryInput,
  UpdateInventoryProduct,
  UpdateInventoryOffering,
  UpdateInventoryPropertyValue,
} from './lib/types/inventory.types.js';

// Taxonomy types
export type {
  EtsyTaxonomyNode,
  EtsyTaxonomyResponse,
} from './lib/types/taxonomy.types.js';

// Common types
export type {
  EtsyApiError,
  EtsyPaginatedResponse,
  EtsyMoney,
  EtsyWhoMade,
  EtsyWhenMade,
  EtsyListingState,
  EtsyWeightUnit,
  EtsyDimensionUnit,
} from './lib/types/common.types.js';
