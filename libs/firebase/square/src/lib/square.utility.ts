/**
 * Square API utility
 *
 * Provides a wrapper around the Square SDK for catalog and inventory operations.
 * Follows the Mountain Sol Braintree pattern for secrets management.
 *
 * @see https://developer.squareup.com/docs/square-get-started
 */
import { SquareClient, SquareEnvironment } from 'square';
import { ServiceEnvironment, secretPair } from '@maple/firebase/functions';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';

/**
 * Secret names for Firebase Functions secrets
 * Use with defineSecret() from firebase-functions/params
 *
 * Pattern: SQUARE_ACCESS_TOKEN for sandbox, SQUARE_ACCESS_TOKEN_PROD for production
 */
export const SQUARE_SECRET_NAMES = [...secretPair('SQUARE_ACCESS_TOKEN')] as const;

/**
 * String parameter names for Firebase Functions
 * Use with defineString() from firebase-functions/params
 *
 * SQUARE_ENV: 'LOCAL' (sandbox) or 'PROD' (production)
 * SQUARE_LOCATION_ID: The location ID for inventory operations
 */
export const SQUARE_STRING_NAMES = ['SQUARE_ENV', 'SQUARE_LOCATION_ID'] as const;

export type SquareSecrets = Record<
  (typeof SQUARE_SECRET_NAMES)[number],
  string
>;

export type SquareStrings = Record<
  (typeof SQUARE_STRING_NAMES)[number],
  string
>;

/**
 * Square utility class
 *
 * Initialize with secrets and strings from Firebase Functions params.
 * Provides access to the Catalog and Inventory services.
 *
 * @example
 * ```typescript
 * // In a Firebase Function using the fluent API:
 * export const createProduct = Functions.endpoint
 *   .usingSecrets(...SQUARE_SECRET_NAMES)
 *   .usingStrings(...SQUARE_STRING_NAMES)
 *   .requiringRole(Role.Admin)
 *   .handle<CreateProductRequest, CreateProductResponse>(
 *     async (data, context, secrets, strings) => {
 *       const square = new Square(secrets, strings);
 *       const result = await square.catalogService.createItem({
 *         name: 'Handmade Mug',
 *         priceCents: 2500,
 *       });
 *     }
 *   );
 * ```
 */
export class Square {
  private readonly client: SquareClient;
  private readonly env: ServiceEnvironment;
  private readonly _catalogService: CatalogService;
  private readonly _inventoryService: InventoryService;
  public readonly locationId: string;

  constructor(
    private readonly secrets: SquareSecrets,
    private readonly strings: SquareStrings
  ) {
    this.env = new ServiceEnvironment(this.strings.SQUARE_ENV);
    const accessToken = this.env.selectSecret(
      this.secrets,
      'SQUARE_ACCESS_TOKEN'
    );

    this.locationId = this.strings.SQUARE_LOCATION_ID;

    if (!this.locationId) {
      throw new Error(
        'Square location ID not configured. Set SQUARE_LOCATION_ID.'
      );
    }

    this.client = new SquareClient({
      token: accessToken,
      environment: this.env.isProd
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
    });

    this._catalogService = new CatalogService(this.client);
    this._inventoryService = new InventoryService(this.client);
  }

  /**
   * Get the Square client for direct API access
   */
  getClient(): SquareClient {
    return this.client;
  }

  /**
   * Check if running in production mode
   */
  isProduction(): boolean {
    return this.env.isProd;
  }

  /**
   * Get the catalog service for creating/updating items
   */
  get catalogService(): CatalogService {
    return this._catalogService;
  }

  /**
   * Get the inventory service for quantity management
   */
  get inventoryService(): InventoryService {
    return this._inventoryService;
  }

  /**
   * Get the raw catalog client
   */
  get catalog() {
    return this.client.catalog;
  }

  /**
   * Get the raw inventory client
   */
  get inventory() {
    return this.client.inventory;
  }

  /**
   * Get the locations client (needed for inventory operations)
   */
  get locations() {
    return this.client.locations;
  }
}
