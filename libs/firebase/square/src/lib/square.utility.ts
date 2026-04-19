/**
 * Square API utility
 *
 * Provides a wrapper around the Square SDK for catalog and inventory operations.
 *
 * With separate Firebase projects for dev and prod, secrets are per-project:
 * - Dev project (maple-and-spruce-dev): SQUARE_ACCESS_TOKEN = sandbox token
 * - Prod project (maple-and-spruce): SQUARE_ACCESS_TOKEN = production token
 *
 * @see https://developer.squareup.com/docs/square-get-started
 */
import { SquareClient, SquareEnvironment } from 'square';
import { ServiceEnvironment } from '@maple/firebase/functions';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { InvoicesService } from './invoices.service';

/**
 * Secret names for Firebase Functions secrets
 * Use with defineSecret() from firebase-functions/params
 *
 * Each Firebase project has its own SQUARE_ACCESS_TOKEN with the appropriate value:
 * - maple-and-spruce-dev: sandbox token
 * - maple-and-spruce: production token
 */
export const SQUARE_SECRET_NAMES = ['SQUARE_ACCESS_TOKEN'] as const;

/**
 * String parameter names for Firebase Functions
 * Use with defineString() from firebase-functions/params
 *
 * SQUARE_ENV: 'LOCAL' (sandbox) or 'PROD' (production)
 * SQUARE_LOCATION_ID: The location ID for inventory operations
 * SALES_TAX_RATE: Sales tax rate as percentage (e.g., '6.0' for 6%)
 */
export const SQUARE_STRING_NAMES = [
  'SQUARE_ENV',
  'SQUARE_LOCATION_ID',
  'SALES_TAX_RATE',
] as const;

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
  private readonly _ordersService: OrdersService;
  private readonly _paymentsService: PaymentsService;
  private readonly _invoicesService: InvoicesService;
  public readonly locationId: string;
  public readonly taxRatePercent: number;

  constructor(
    private readonly secrets: SquareSecrets,
    private readonly strings: SquareStrings
  ) {
    this.env = new ServiceEnvironment(this.strings.SQUARE_ENV);
    // With per-project secrets, just get the token directly - no suffix needed
    const accessToken = this.env.getSecret(
      this.secrets,
      'SQUARE_ACCESS_TOKEN'
    );

    this.locationId = this.strings.SQUARE_LOCATION_ID;

    if (!this.locationId) {
      throw new Error(
        'Square location ID not configured. Set SQUARE_LOCATION_ID.'
      );
    }

    const taxRate = parseFloat(this.strings.SALES_TAX_RATE);
    if (isNaN(taxRate) || taxRate < 0) {
      throw new Error(
        'Sales tax rate not configured or invalid. Set SALES_TAX_RATE (e.g., "6.0").'
      );
    }
    this.taxRatePercent = taxRate;

    this.client = new SquareClient({
      token: accessToken,
      environment: this.env.isProd
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
      ...(process.env['SQUARE_BASE_URL']
        ? { baseUrl: process.env['SQUARE_BASE_URL'] }
        : {}),
    });

    this._catalogService = new CatalogService(this.client);
    this._inventoryService = new InventoryService(this.client);
    this._ordersService = new OrdersService(this.client);
    this._paymentsService = new PaymentsService(this.client);
    this._invoicesService = new InvoicesService(this.client);
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
   * Get the orders service for creating orders with tax
   */
  get ordersService(): OrdersService {
    return this._ordersService;
  }

  /**
   * Get the payments service for processing payments and refunds
   */
  get paymentsService(): PaymentsService {
    return this._paymentsService;
  }

  /**
   * Get the invoices service for sending hosted-payment invoices
   */
  get invoicesService(): InvoicesService {
    return this._invoicesService;
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
