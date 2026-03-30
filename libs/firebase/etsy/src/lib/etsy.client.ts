/**
 * Etsy API Client
 *
 * Main entry point for interacting with the Etsy Open API v3.
 * Designed as a publishable-quality, framework-agnostic package
 * with zero external runtime dependencies.
 *
 * Token storage is pluggable via the TokenStorage interface, allowing
 * use with Firestore, files, in-memory storage, or any custom backend.
 *
 * @example
 * ```typescript
 * const client = new EtsyClient({
 *   apiKey: 'your-keystring',
 *   sharedSecret: 'your-shared-secret',
 *   tokenStorage: new FirestoreTokenStorage(db),
 *   redirectUri: 'https://your-app.com/oauth/callback',
 * });
 *
 * // Generate OAuth URL
 * const { url, codeVerifier, state } = client.oauth.generateAuthUrl(
 *   'listings_r listings_w shops_r'
 * );
 *
 * // After user authorizes, exchange the code
 * await client.oauth.exchangeCode({ code, codeVerifier });
 *
 * // Now use the API
 * const listings = await client.listings.getActiveListings();
 * ```
 *
 * @see https://developers.etsy.com/documentation/
 */
import type { EtsyClientConfig, TokenStorage } from './oauth/types.js';
import { OAuthService } from './oauth/oauth.service.js';
import { EtsyHttp } from './http/etsy-http.js';
import { ListingService } from './services/listing.service.js';
import { InventoryService } from './services/inventory.service.js';
import { TaxonomyService } from './services/taxonomy.service.js';

export class EtsyClient {
  private readonly _oauth: OAuthService;
  private readonly _http: EtsyHttp;
  private readonly _listings: ListingService;
  private readonly _inventory: InventoryService;
  private readonly _taxonomy: TaxonomyService;
  private readonly tokenStorage: TokenStorage;

  constructor(config: EtsyClientConfig) {
    this.tokenStorage = config.tokenStorage;

    this._oauth = new OAuthService(
      config.apiKey,
      config.tokenStorage,
      config.redirectUri
    );

    this._http = new EtsyHttp(
      config.apiKey,
      config.sharedSecret,
      this._oauth
    );

    this._listings = new ListingService(this._http, async () => {
      const tokens = await this.tokenStorage.getTokens();
      if (!tokens?.shopId) {
        throw new Error(
          'Shop ID not available. Complete OAuth and set the shop ID on the token data.'
        );
      }
      return tokens.shopId;
    });

    this._inventory = new InventoryService(this._http);
    this._taxonomy = new TaxonomyService(this._http);
  }

  /** OAuth 2.0 service for authorization and token management */
  get oauth(): OAuthService {
    return this._oauth;
  }

  /** Listing CRUD operations */
  get listings(): ListingService {
    return this._listings;
  }

  /** Inventory management (quantity, pricing) */
  get inventory(): InventoryService {
    return this._inventory;
  }

  /** Seller taxonomy (categories) for listing creation */
  get taxonomy(): TaxonomyService {
    return this._taxonomy;
  }
}
