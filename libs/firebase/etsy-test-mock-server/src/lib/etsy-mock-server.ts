/**
 * Standalone Etsy mock HTTP server.
 *
 * Serves Etsy v3 API responses for integration tests.
 * One of three per-service mock servers (Square, Webflow, Etsy).
 */
import http from 'http';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  timestamp: Date;
}

interface RouteHandler {
  method: string;
  /** Path pattern — supports :param placeholders */
  pattern: string;
  handler: (
    req: ParsedRequest
  ) =>
    | {
        status: number;
        body: unknown;
        contentType?: string;
        rawBody?: Buffer;
      }
    | Promise<{
        status: number;
        body: unknown;
        contentType?: string;
        rawBody?: Buffer;
      }>;
}

interface ParsedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export class EtsyMockServer {
  private server: http.Server | null = null;
  private routes: RouteHandler[] = [];
  private _requests: RecordedRequest[] = [];

  route(
    method: string,
    pattern: string,
    handler: RouteHandler['handler']
  ): this {
    this.routes.push({ method: method.toUpperCase(), pattern, handler });
    return this;
  }

  get(pattern: string, handler: RouteHandler['handler']): this {
    return this.route('GET', pattern, handler);
  }

  post(pattern: string, handler: RouteHandler['handler']): this {
    return this.route('POST', pattern, handler);
  }

  /** All recorded requests since last reset. */
  get requests(): readonly RecordedRequest[] {
    return this._requests;
  }

  /** Get requests matching a path prefix. */
  getRequests(pathPrefix: string): RecordedRequest[] {
    return this._requests.filter((r) => r.path.startsWith(pathPrefix));
  }

  clearRequests(): void {
    this._requests = [];
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const rawBody = await readRawBody(req);
        const method = req.method?.toUpperCase() ?? 'GET';
        const path = req.url ?? '/';
        const body = parseBody(rawBody, req.headers['content-type']);

        this._requests.push({
          method,
          path,
          headers: req.headers,
          body,
          timestamp: new Date(),
        });

        const { pathname, query } = splitQuery(path);

        for (const route of this.routes) {
          if (route.method !== method) continue;
          const params = matchPattern(route.pattern, pathname);
          if (params !== null) {
            try {
              const result = await route.handler({
                method,
                path: pathname,
                query,
                params,
                body,
                headers: req.headers,
              });
              if (result.rawBody) {
                res.writeHead(result.status, {
                  'Content-Type': result.contentType ?? 'application/octet-stream',
                });
                res.end(result.rawBody);
              } else {
                res.writeHead(result.status, {
                  'Content-Type': result.contentType ?? 'application/json',
                });
                res.end(JSON.stringify(result.body));
              }
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : 'Internal error',
                })
              );
            }
            return;
          }
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Etsy mock server: no route matched',
            method,
            path,
          })
        );
      });

      this.server.on('error', reject);
      this.server.listen(port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

function readRawBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function parseBody(raw: Buffer, contentType?: string): unknown {
  if (raw.length === 0) return undefined;
  const text = raw.toString();
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text);
    const obj: Record<string, string> = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function splitQuery(path: string): {
  pathname: string;
  query: Record<string, string>;
} {
  const [pathname, queryString = ''] = path.split('?');
  const query: Record<string, string> = {};
  if (queryString) {
    for (const [k, v] of new URLSearchParams(queryString)) {
      query[k] = v;
    }
  }
  return { pathname, query };
}

function matchPattern(
  pattern: string,
  pathname: string
): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
