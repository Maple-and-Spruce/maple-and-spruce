/**
 * Standalone Meta Conversions API mock HTTP server.
 *
 * Serves `POST /<apiVersion>/<pixelId>/events` for the tally-lead-webhook
 * function. The real Meta CAPI returns a JSON body with `events_received`
 * and a `fbtrace_id`; the mock returns the same shape so the function
 * code path is exercised end-to-end.
 *
 * Per-service mock server, parallel to libs/firebase/{square,webflow,etsy}-test-mock-server.
 */
import http from 'http';

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  pixelId?: string;
  apiVersion?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  timestamp: Date;
}

export interface MetaCapiMockInstance {
  server: MetaCapiMockServer;
  reset: () => void;
}

const EVENTS_PATH_PATTERN = /^\/(v\d+\.\d+)\/([^/]+)\/events$/;

export class MetaCapiMockServer {
  private server: http.Server | null = null;
  private _requests: RecordedRequest[] = [];
  /**
   * When set, the events endpoint responds with this status instead of 200.
   * Tests use this to simulate downstream failures.
   */
  failureStatus: number | null = null;

  get requests(): readonly RecordedRequest[] {
    return this._requests;
  }

  /** Requests recorded against any /v{N}.{N}/{pixel}/events path. */
  getEventsRequests(): RecordedRequest[] {
    return this._requests.filter((r) => EVENTS_PATH_PATTERN.test(r.path));
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

        const match = EVENTS_PATH_PATTERN.exec(path);

        this._requests.push({
          method,
          path,
          query,
          apiVersion: match?.[1],
          pixelId: match?.[2],
          headers: req.headers,
          body,
          timestamp: new Date(),
        });

        if (method === 'POST' && match) {
          if (this.failureStatus) {
            res.writeHead(this.failureStatus, {
              'Content-Type': 'application/json',
            });
            res.end(
              JSON.stringify({
                error: { message: 'simulated Meta CAPI failure' },
              })
            );
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              events_received: 1,
              messages: [],
              fbtrace_id: 'mock-fbtrace-id',
            })
          );
          return;
        }

        // Test-control endpoints under /_mock/* — see ga4-mock-server for rationale.
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
            error: 'Meta CAPI mock server: no route matched',
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

export function createMetaCapiMockServer(): MetaCapiMockInstance {
  const server = new MetaCapiMockServer();
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
