/**
 * Minimal MailerLite e-commerce client.
 *
 * Sends orders to a MailerLite "custom" shop so campaign and automation reports
 * show the sales they earned. MailerLite credits an order to an email when the
 * buyer arrived through a tracked campaign link (its universal script on the
 * Webflow site records the click); the order itself only names the buyer's
 * email. See https://developers.mailerlite.com/guides/ecommerce.html.
 *
 * Every call uses `?with_resource_id`, so ids are ours: the class id for the
 * product, the confirmation number for the order. That makes a retry safe:
 *
 * - Creating a product whose resource id exists returns the existing product
 *   (it updates in place), so the product is upserted before every order.
 * - Creating an order whose resource id exists is REJECTED (422, "already
 *   exists"). We then update that order instead, so a retried trigger or a
 *   duplicate webhook never counts one sale twice.
 *
 * Consent: the customer is always sent with `create_subscriber: false`. An order
 * must never add a buyer to the mailing list; that needs their opt-in (#37/#38).
 * Verified against the live API on 2026-10-22: an order for an email that is not
 * a subscriber leaves it not a subscriber.
 */

/** Connection settings for one shop. */
export interface MailerLiteConfig {
  /** `https://connect.mailerlite.com` in prod; the mock server in tests. */
  baseUrl: string;
  apiKey: string;
  /** The MailerLite shop id (theirs, numeric string). */
  shopId: string;
  /** Abort each request after this many ms. `fetch` has no default timeout. */
  timeoutMs?: number;
}

/** @see MailerLiteConfig.timeoutMs */
export const DEFAULT_MAILERLITE_TIMEOUT_MS = 5_000;

/** A product, keyed by our own id. */
export interface MailerLiteProduct {
  resourceId: string;
  name: string;
  /** Unit price in dollars. */
  price: number;
  url?: string;
}

/** One line of an order. */
export interface MailerLiteOrderItem {
  productResourceId: string;
  quantity: number;
  /** Unit price in dollars. */
  price: number;
}

/** An order, keyed by our own id. */
export interface MailerLiteOrder {
  resourceId: string;
  customerEmail: string;
  items: MailerLiteOrderItem[];
  /** Order total in dollars. */
  totalPrice: number;
  status: 'pending' | 'complete';
}

/** Thrown for any non-2xx answer, carrying the status for the caller. */
export class MailerLiteError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`MailerLite ${status}: ${body}`);
    this.name = 'MailerLiteError';
  }
}

async function request(
  config: MailerLiteConfig,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${config.baseUrl}/api/ecommerce/shops/${encodeURIComponent(
    config.shopId,
  )}${path}?with_resource_id`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(
      config.timeoutMs ?? DEFAULT_MAILERLITE_TIMEOUT_MS,
    ),
  });
  const text = await response.text().catch(() => '');
  if (!response.ok) throw new MailerLiteError(response.status, text);
  return text ? JSON.parse(text) : undefined;
}

/** The product body MailerLite expects. */
export function buildProductBody(
  product: MailerLiteProduct,
): Record<string, unknown> {
  return {
    resource_id: product.resourceId,
    name: product.name,
    price: product.price,
    ...(product.url ? { url: product.url } : {}),
    // A class is bought once for a date; MailerLite's product-based
    // automations (abandoned cart, "bought X") don't apply to it.
    exclude_from_automations: true,
  };
}

/** The order body MailerLite expects. */
export function buildOrderBody(
  order: MailerLiteOrder,
): Record<string, unknown> {
  const email = order.customerEmail.trim().toLowerCase();
  return {
    resource_id: order.resourceId,
    customer: {
      // The email is the stable person key, as on Meta (`external_id`).
      resource_id: email,
      email,
      // Never subscribe a buyer from an order. `accepts_marketing` is left out
      // on purpose so an existing subscriber's status is not touched.
      create_subscriber: false,
    },
    cart: {
      resource_id: order.resourceId,
      items: order.items.map((item, index) => ({
        resource_id: `${order.resourceId}-${index + 1}`,
        product_resource_id: item.productResourceId,
        quantity: item.quantity,
        price: item.price,
      })),
    },
    status: order.status,
    total_price: order.totalPrice,
  };
}

/** Create the product, or update it when the id already exists. */
export async function upsertProduct(
  config: MailerLiteConfig,
  product: MailerLiteProduct,
): Promise<void> {
  await request(config, 'POST', '/products', buildProductBody(product));
}

function isAlreadyExists(err: unknown): boolean {
  return (
    err instanceof MailerLiteError &&
    err.status === 422 &&
    /already exists/i.test(err.body)
  );
}

/**
 * Create the order. If one with this resource id already exists (a retry),
 * update its status and total instead. Returns which happened.
 */
export async function createOrUpdateOrder(
  config: MailerLiteConfig,
  order: MailerLiteOrder,
): Promise<'created' | 'updated'> {
  try {
    await request(config, 'POST', '/orders', buildOrderBody(order));
    return 'created';
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    await request(
      config,
      'PUT',
      `/orders/${encodeURIComponent(order.resourceId)}`,
      { status: order.status, total_price: order.totalPrice },
    );
    return 'updated';
  }
}

/**
 * Upsert each product, then send the order. Best-effort: logs and swallows
 * every error, like `trySendMetaCapiEvents`, because a missed revenue report
 * must never retry-loop a trigger or touch the registration.
 * Returns whether the order reached MailerLite.
 */
export async function tryRecordOrder(
  config: MailerLiteConfig,
  products: MailerLiteProduct[],
  order: MailerLiteOrder,
  logger: Pick<Console, 'log' | 'error'> = console,
): Promise<boolean> {
  try {
    for (const product of products) await upsertProduct(config, product);
    const outcome = await createOrUpdateOrder(config, order);
    logger.log(`MailerLite order ${outcome}`, {
      orderResourceId: order.resourceId,
      totalPrice: order.totalPrice,
    });
    return true;
  } catch (err) {
    logger.error('MailerLite order send failed', {
      orderResourceId: order.resourceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Whether a shop is configured. An empty shop id turns MailerLite off. */
export function isMailerLiteConfigured(config: MailerLiteConfig): boolean {
  return Boolean(config.shopId.trim());
}

function isNotFound(err: unknown): boolean {
  return err instanceof MailerLiteError && err.status === 404;
}

/**
 * Bring an order in line with a refund. `keptTotal` is what the business kept,
 * in dollars: the order's total becomes that, and an order with nothing kept
 * is deleted so it stops counting as a sale in campaign reports.
 *
 * An order that was never sent (shop off at the time, or a failed send) is a
 * 404, which counts as done: there is nothing to correct.
 */
export async function adjustOrderForRefund(
  config: MailerLiteConfig,
  orderResourceId: string,
  keptTotal: number,
): Promise<'updated' | 'deleted' | 'missing'> {
  const path = `/orders/${encodeURIComponent(orderResourceId)}`;
  try {
    if (keptTotal <= 0) {
      await request(config, 'DELETE', path);
      return 'deleted';
    }
    await request(config, 'PUT', path, {
      status: 'complete',
      total_price: keptTotal,
    });
    return 'updated';
  } catch (err) {
    if (isNotFound(err)) return 'missing';
    throw err;
  }
}

/** Best-effort {@link adjustOrderForRefund}: logs and swallows every error. */
export async function tryAdjustOrderForRefund(
  config: MailerLiteConfig,
  orderResourceId: string,
  keptTotal: number,
  logger: Pick<Console, 'log' | 'error'> = console,
): Promise<boolean> {
  try {
    const outcome = await adjustOrderForRefund(
      config,
      orderResourceId,
      keptTotal,
    );
    logger.log(`MailerLite order refund adjustment: ${outcome}`, {
      orderResourceId,
      keptTotal,
    });
    return outcome !== 'missing';
  } catch (err) {
    logger.error('MailerLite order refund adjustment failed', {
      orderResourceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Secret names for `Functions.endpoint.usingSecrets(...)`. */
export const MAILERLITE_SECRET_NAMES = ['MAILERLITE_API_KEY'] as const;
/** Param names for `Functions.endpoint.usingStrings(...)`. */
export const MAILERLITE_STRING_NAMES = [
  'MAILERLITE_SHOP_ID',
  'MAILERLITE_BASE_URL',
] as const;

/** Build a config from a callable's resolved secrets and strings. */
export function mailerLiteConfigFrom(
  secrets: Record<(typeof MAILERLITE_SECRET_NAMES)[number], string>,
  strings: Record<(typeof MAILERLITE_STRING_NAMES)[number], string>,
  timeoutMs?: number,
): MailerLiteConfig {
  return {
    apiKey: secrets.MAILERLITE_API_KEY,
    shopId: strings.MAILERLITE_SHOP_ID ?? '',
    baseUrl: strings.MAILERLITE_BASE_URL || 'https://connect.mailerlite.com',
    timeoutMs,
  };
}
