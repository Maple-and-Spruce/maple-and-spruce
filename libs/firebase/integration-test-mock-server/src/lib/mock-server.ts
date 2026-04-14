/**
 * Mock HTTP server for external API dependencies.
 *
 * Intercepts Square and Webflow API calls during integration tests
 * by running a local Express server that the SDK clients are pointed
 * at via SQUARE_BASE_URL and WEBFLOW_BASE_URL env vars.
 *
 * Provides request recording so tests can assert on what was sent.
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
  ) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
}

interface ParsedRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export class MockServer {
  private server: http.Server | null = null;
  private routes: RouteHandler[] = [];
  private _requests: RecordedRequest[] = [];

  /**
   * Register a route handler.
   */
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

  put(pattern: string, handler: RouteHandler['handler']): this {
    return this.route('PUT', pattern, handler);
  }

  patch(pattern: string, handler: RouteHandler['handler']): this {
    return this.route('PATCH', pattern, handler);
  }

  delete(pattern: string, handler: RouteHandler['handler']): this {
    return this.route('DELETE', pattern, handler);
  }

  /**
   * All recorded requests since last reset.
   */
  get requests(): readonly RecordedRequest[] {
    return this._requests;
  }

  /**
   * Get requests matching a path pattern.
   */
  getRequests(pathPrefix: string): RecordedRequest[] {
    return this._requests.filter((r) => r.path.startsWith(pathPrefix));
  }

  /**
   * Clear recorded requests.
   */
  clearRequests(): void {
    this._requests = [];
  }

  /**
   * Start the server on the given port.
   */
  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const body = await readBody(req);
        const method = req.method?.toUpperCase() ?? 'GET';
        const path = req.url ?? '/';

        // Record the request
        this._requests.push({
          method,
          path,
          headers: req.headers,
          body,
          timestamp: new Date(),
        });

        // Find matching route
        for (const route of this.routes) {
          if (route.method !== method) continue;
          const params = matchPattern(route.pattern, path);
          if (params !== null) {
            try {
              const result = await route.handler({
                method,
                path,
                params,
                body,
                headers: req.headers,
              });
              res.writeHead(result.status, {
                'Content-Type': 'application/json',
              });
              res.end(JSON.stringify(result.body));
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

        // No route matched — return 404 with helpful info
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Mock server: no route matched',
            method,
            path,
          })
        );
      });

      this.server.on('error', reject);
      this.server.listen(port, () => resolve());
    });
  }

  /**
   * Stop the server.
   */
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

/**
 * Read request body as JSON or string.
 */
function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

/**
 * Match a URL path against a pattern with :param placeholders.
 * Returns params object if match, null otherwise.
 *
 * Strips query string before matching.
 */
function matchPattern(
  pattern: string,
  path: string
): Record<string, string> | null {
  const cleanPath = path.split('?')[0];
  const patternParts = pattern.split('/');
  const pathParts = cleanPath.split('/');

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
