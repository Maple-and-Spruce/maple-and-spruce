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
import { CardsService } from './cards.service';
import { SubscriptionsService } from './subscriptions.service';
import { CustomersService } from './customers.service';

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
 * Music Together (MT) is a SEPARATE business (Stephanie's single-member LLC)
 * with its OWN Square account/checking. Its checkouts must route to MT's
 * Square credentials, not Maple & Spruce's. These are the prefixed param names
 * a Cloud Function declares via `.usingSecrets(...)` / `.usingStrings(...)`
 * when it needs the MT account.
 *
 * The secret value (MT_SQUARE_ACCESS_TOKEN) lives in Secret Manager / .secret.local,
 * never in the tracked .env files. The string params live in .env.dev/.env.prod
 * (mirroring the default SQUARE_* set).
 */
export const MT_SQUARE_SECRET_NAMES = ['MT_SQUARE_ACCESS_TOKEN'] as const;

export const MT_SQUARE_STRING_NAMES = [
  'MT_SQUARE_ENV',
  'MT_SQUARE_LOCATION_ID',
  'MT_SALES_TAX_RATE',
] as const;

/**
 * The four Firebase param names a {@link Square} instance reads, so the same
 * client wrapper can be pointed at either the Maple & Spruce account (default)
 * or a second program's account (e.g. Music Together) without touching any
 * call site beyond which key set it passes.
 */
export interface SquareParamKeys {
  /** defineSecret name holding the access token */
  accessTokenSecret: string;
  /** defineString name holding 'LOCAL' | 'PROD' */
  envString: string;
  /** defineString name holding the Square location ID */
  locationIdString: string;
  /** defineString name holding the sales-tax rate percent (e.g. '6.0') */
  taxRateString: string;
}

/** Default Maple & Spruce account keys — preserves all existing behavior. */
export const DEFAULT_SQUARE_KEYS: SquareParamKeys = {
  accessTokenSecret: 'SQUARE_ACCESS_TOKEN',
  envString: 'SQUARE_ENV',
  locationIdString: 'SQUARE_LOCATION_ID',
  taxRateString: 'SALES_TAX_RATE',
};

/** Music Together account keys (separate Square account). */
export const MT_SQUARE_KEYS: SquareParamKeys = {
  accessTokenSecret: 'MT_SQUARE_ACCESS_TOKEN',
  envString: 'MT_SQUARE_ENV',
  locationIdString: 'MT_SQUARE_LOCATION_ID',
  taxRateString: 'MT_SALES_TAX_RATE',
};

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
  private readonly _cardsService: CardsService;
  private readonly _subscriptionsService: SubscriptionsService;
  private readonly _customersService: CustomersService;
  public readonly locationId: string;
  public readonly taxRatePercent: number;

  /**
   * @param secrets - Resolved Firebase secrets (keyed by secret name)
   * @param strings - Resolved Firebase string params (keyed by param name)
   * @param keys - Which param names to read. Defaults to the Maple & Spruce
   *   account ({@link DEFAULT_SQUARE_KEYS}). Pass {@link MT_SQUARE_KEYS} to
   *   route to the Music Together account.
   */
  constructor(
    private readonly secrets: Record<string, string>,
    private readonly strings: Record<string, string>,
    keys: SquareParamKeys = DEFAULT_SQUARE_KEYS
  ) {
    this.env = new ServiceEnvironment(this.strings[keys.envString]);
    // With per-project secrets, just get the token directly - no suffix needed
    const accessToken = this.env.getSecret(
      this.secrets,
      keys.accessTokenSecret
    );

    this.locationId = this.strings[keys.locationIdString];

    if (!this.locationId) {
      throw new Error(
        `Square location ID not configured. Set ${keys.locationIdString}.`
      );
    }

    const taxRate = parseFloat(this.strings[keys.taxRateString]);
    if (isNaN(taxRate) || taxRate < 0) {
      throw new Error(
        `Sales tax rate not configured or invalid. Set ${keys.taxRateString} (e.g., "6.0").`
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
    this._cardsService = new CardsService(this.client);
    this._subscriptionsService = new SubscriptionsService(this.client);
    this._customersService = new CustomersService(this.client);
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
   * Get the cards service for storing cards on file (subscription billing)
   */
  get cardsService(): CardsService {
    return this._cardsService;
  }

  /**
   * Get the subscriptions service for recurring Craft Club billing
   */
  get subscriptionsService(): SubscriptionsService {
    return this._subscriptionsService;
  }

  /**
   * Get the customers service for email-first customer upsert
   */
  get customersService(): CustomersService {
    return this._customersService;
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
