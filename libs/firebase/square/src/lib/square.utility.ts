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
import {
  resolveSquareCredentials,
  DEFAULT_SQUARE_KEYS,
  type SquareParamKeys,
} from './square-credentials';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { InvoicesService } from './invoices.service';
import { CardsService } from './cards.service';
import { SubscriptionsService } from './subscriptions.service';
import { CustomersService } from './customers.service';

// Re-export the credential symbols so existing importers of './square.utility'
// (and the lib barrel) keep working. The definitions live in the barrel-free
// './square-credentials' module so unit tests can cover them without pulling
// the functions/database layers into the coverage denominator.
export {
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
  MT_SQUARE_SECRET_NAMES,
  MT_SQUARE_STRING_NAMES,
  DEFAULT_SQUARE_KEYS,
  MT_SQUARE_KEYS,
  resolveSquareCredentials,
  type SquareSecrets,
  type SquareStrings,
  type SquareParamKeys,
  type ResolvedSquareCredentials,
} from './square-credentials';

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
  private readonly _isProd: boolean;
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
    // Pure routing + validation lives in ./square-credentials so it can be
    // unit-tested without loading this file's heavy imports.
    const { accessToken, locationId, taxRatePercent, isProd } =
      resolveSquareCredentials(this.secrets, this.strings, keys);

    this.locationId = locationId;
    this.taxRatePercent = taxRatePercent;
    this._isProd = isProd;

    this.client = new SquareClient({
      token: accessToken,
      environment: this._isProd
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
    return this._isProd;
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
