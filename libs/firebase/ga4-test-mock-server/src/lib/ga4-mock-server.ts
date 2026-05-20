/**
 * Standalone GA4 Measurement Protocol mock HTTP server.
 *
 * Serves the `POST /mp/collect` endpoint used by the tally-lead-webhook
 * function. The real GA4 endpoint always answers 200 (or 204 with a tiny
 * empty body) regardless of payload content, so the mock mirrors that
 * shape and just records what was sent so tests can assert on it.
 *
 * Per-service mock server, parallel to libs/firebase/{square,webflow,etsy}-test-mock-server.
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

export interface Ga4MockInstance {
  server: Ga4MockServer;
  reset: () => void;
}

export class Ga4MockServer {
  private server: http.Server | null = null;
  private _requests: RecordedRequest[] = [];
  /**
   * When set, `/mp/collect` responds with this status instead of 200.
   * Tests use this to simulate downstream failures.
   */
  failureStatus: number | null = null;

  get requests(): readonly RecordedRequest[] {
    return this._requests;
  }

  /** Requests recorded against `/mp/collect`. */
  getCollectRequests(): RecordedRequest[] {
    return this._requests.filter((r) => r.path.startsWith('/mp/collect'));
  }

  clearRequests(): void {
    this._requests = [];
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const body = await readBody(req);
        const method = req.method?.toUpperCase() ?? 'GET';
        const url = req.url ?? '/';
        const [path, queryString = ''] = url.split('?');
        const query: Record<string, string> = {};
        if (queryString) {
          for (const pair of queryString.split('&')) {
            const [k, v = ''] = pair.split('=');
            if (k) query[decodeURIComponent(k)] = decodeURIComponent(v);
          }
        }

        this._requests.push({
          method,
          path,
          query,
          headers: req.headers,
          body,
          timestamp: new Date(),
        });

        if (method === 'POST' && path === '/mp/collect') {
          if (this.failureStatus) {
            res.writeHead(this.failureStatus, {
              'Content-Type': 'application/json',
            });
            res.end(JSON.stringify({ error: 'simulated GA4 failure' }));
            return;
          }
          // Real GA4 returns 204 with no body. JSON 200 is also accepted and
          // a little easier to spot in test output.
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // Test-control endpoints under /_mock/* — the mock server runs in
        // its own process, so tests need an HTTP surface to inspect state
        // and toggle failure mode.
        if (method === 'POST' && path === '/_mock/reset') {
          this.clearRequests();
          this.failureStatus = null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (method === 'GET' && path === '/_mock/requests') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ requests: this._requests }));
          return;
        }
        if (method === 'POST' && path === '/_mock/failure-status') {
          const status = (body as { status?: number } | undefined)?.status;
          this.failureStatus = typeof status === 'number' ? status : null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, failureStatus: this.failureStatus }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'GA4 mock server: no route matched',
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

export function createGa4MockServer(): Ga4MockInstance {
  const server = new Ga4MockServer();
  return {
    server,
    reset: () => {
      server.clearRequests();
      server.failureStatus = null;
    },
  };
}

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
