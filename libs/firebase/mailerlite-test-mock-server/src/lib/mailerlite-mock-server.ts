/**
 * Standalone MailerLite e-commerce mock HTTP server.
 *
 * Serves the routes `@maple/firebase/mailerlite` calls. The responses copy the
 * live API's behaviour, captured against a test shop on 2026-10-22, not the
 * docs:
 *
 * - Creating a product whose `resource_id` exists answers 201 with the SAME
 *   product (MailerLite updates it in place).
 * - Creating an order whose `resource_id` exists is REJECTED with 422 and the
 *   message below. The client must update instead, so the mock enforces it:
 *   a client that ignored the 422 would count a retried sale twice.
 * - `create_subscriber: false` leaves `customer.subscriber` null.
 * - Updating or deleting an unknown order id is a 404 (DELETE answers 204).
 *
 * Per-service mock server, parallel to libs/firebase/{ga4,meta-capi}-test-mock-server.
 */
import http from 'http';

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  timestamp: Date;
}

export interface MailerLiteMockInstance {
  server: MailerLiteMockServer;
  reset: () => void;
}

/** The live API's message for a repeated order id, verbatim. */
export const ORDER_EXISTS_MESSAGE =
  "An Ecommerce order with this resource ID already exists. Please include 'with_resource_id' in your request to update it.";

interface StoredOrder {
  resource_id: string;
  status: string;
  total_price: number;
  body: Record<string, unknown>;
}

const SHOP_PATH =
  /^\/api\/ecommerce\/shops\/([^/]+)\/(products|orders)(?:\/([^/]+))?$/;

let nextId = 202086830000000000n;
function mlId(): string {
  nextId += 1n;
  return nextId.toString();
}

export class MailerLiteMockServer {
  private server: http.Server | null = null;
  private _requests: RecordedRequest[] = [];
  /** Orders by `${shopId}/${resource_id}`. */
  private orders = new Map<string, StoredOrder>();
  /** MailerLite ids of products by `${shopId}/${resource_id}`. */
  private products = new Map<string, string>();
  /** When set, every shop route answers with this status. */
  failureStatus: number | null = null;

  get requests(): readonly RecordedRequest[] {
    return this._requests;
  }

  getOrder(shopId: string, resourceId: string): StoredOrder | undefined {
    return this.orders.get(`${shopId}/${resourceId}`);
  }

  clear(): void {
    this._requests = [];
    this.orders.clear();
    this.products.clear();
    this.failureStatus = null;
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const body = await readBody(req);
        const method = req.method?.toUpperCase() ?? 'GET';
        const [path, queryString = ''] = (req.url ?? '/').split('?');
        const query: Record<string, string> = {};
        for (const pair of queryString.split('&')) {
          if (!pair) continue;
          const [k, v = ''] = pair.split('=');
          query[decodeURIComponent(k)] = decodeURIComponent(v);
        }

        const send = (status: number, payload: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        };

        // Test-control endpoints: the mock runs in its own process.
        if (method === 'POST' && path === '/_mock/reset') {
          this.clear();
          return send(200, { ok: true });
        }
        if (method === 'GET' && path === '/_mock/requests') {
          return send(200, {
            requests: this._requests,
            orders: Object.fromEntries(this.orders),
          });
        }
        if (method === 'POST' && path === '/_mock/failure-status') {
          const status = (body as { status?: number } | undefined)?.status;
          this.failureStatus = typeof status === 'number' ? status : null;
          return send(200, { ok: true, failureStatus: this.failureStatus });
        }

        this._requests.push({
          method,
          path,
          query,
          headers: req.headers,
          body,
          timestamp: new Date(),
        });

        const match = SHOP_PATH.exec(path);
        if (!match) {
          return send(404, {
            error: 'MailerLite mock server: no route matched',
            method,
            path,
          });
        }
        if (!String(req.headers['authorization'] ?? '').startsWith('Bearer ')) {
          return send(401, { message: 'Unauthenticated.' });
        }
        if (this.failureStatus) {
          return send(this.failureStatus, {
            message: 'simulated MailerLite failure',
          });
        }

        const [, shopId, resource, id] = match;
        const data = (body ?? {}) as Record<string, unknown>;

        if (resource === 'products' && method === 'POST' && !id) {
          const key = `${shopId}/${data['resource_id']}`;
          const mlProductId = this.products.get(key) ?? mlId();
          this.products.set(key, mlProductId);
          return send(201, {
            data: {
              id: mlProductId,
              name: data['name'],
              resource_id: data['resource_id'],
              price: data['price'],
              url: data['url'] ?? null,
              image: null,
              exclude_from_automations:
                data['exclude_from_automations'] ?? false,
              enabled: true,
              type: 'one-time',
              categories: [],
              variants: [],
            },
          });
        }

        if (resource === 'orders' && method === 'POST' && !id) {
          const resourceId = String(data['resource_id']);
          const key = `${shopId}/${resourceId}`;
          if (this.orders.has(key)) {
            return send(422, {
              message: ORDER_EXISTS_MESSAGE,
              errors: { resource_id: [ORDER_EXISTS_MESSAGE] },
            });
          }
          const order: StoredOrder = {
            resource_id: resourceId,
            status: String(data['status']),
            total_price: Number(data['total_price']),
            body: data,
          };
          this.orders.set(key, order);
          const customer = (data['customer'] ?? {}) as Record<string, unknown>;
          return send(201, {
            data: {
              id: mlId(),
              resource_id: resourceId,
              customer: {
                id: mlId(),
                resource_id: customer['resource_id'] ?? null,
                email: customer['email'],
                accepts_marketing: customer['accepts_marketing'] ?? false,
                total_spent: null,
                orders_count: null,
                // What the live API answers for create_subscriber: false.
                subscriber: null,
              },
              total: order.total_price,
              status: order.status,
              attribution: null,
            },
          });
        }

        if (resource === 'orders' && method === 'PUT' && id) {
          const existing = this.orders.get(
            `${shopId}/${decodeURIComponent(id)}`,
          );
          if (!existing) return send(404, { message: 'Resource not found.' });
          if (data['status'] !== undefined)
            existing.status = String(data['status']);
          if (data['total_price'] !== undefined) {
            existing.total_price = Number(data['total_price']);
          }
          return send(200, {
            data: {
              resource_id: existing.resource_id,
              total: existing.total_price,
              status: existing.status,
            },
          });
        }

        if (resource === 'orders' && method === 'DELETE' && id) {
          const key = `${shopId}/${decodeURIComponent(id)}`;
          if (!this.orders.has(key)) {
            return send(404, { message: 'Resource not found.' });
          }
          this.orders.delete(key);
          res.writeHead(204);
          res.end();
          return;
        }

        return send(405, { message: 'Method not allowed by mock.' });
      });

      this.server.on('error', reject);
      this.server.listen(port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
  }
}

export function createMailerLiteMockServer(): MailerLiteMockInstance {
  const server = new MailerLiteMockServer();
  return { server, reset: () => server.clear() };
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}
