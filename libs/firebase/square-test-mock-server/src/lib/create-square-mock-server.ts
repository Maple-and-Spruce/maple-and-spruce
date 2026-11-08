/**
 * Factory for the Square mock server.
 *
 * Registers Square API routes and exposes a reset() helper for test
 * suites to clear per-test state without restarting the HTTP server.
 */
import { SquareMockServer } from './square-mock-server';
import { registerSquareRoutes, resetSquareState } from './routes/square';
import { registerGiftCardRoutes, resetGiftCardState } from './routes/gift-cards';

export interface SquareMockInstance {
  server: SquareMockServer;
  reset: () => void;
}

export function createSquareMockServer(): SquareMockInstance {
  const server = new SquareMockServer();
  // First: gift card routes answer their own requests on shared paths
  // (`POST /v2/orders`) and pass the rest on to the general Square routes.
  registerGiftCardRoutes(server);
  registerSquareRoutes(server);

  return {
    server,
    reset: () => {
      server.clearRequests();
      resetSquareState();
      resetGiftCardState();
    },
  };
}
