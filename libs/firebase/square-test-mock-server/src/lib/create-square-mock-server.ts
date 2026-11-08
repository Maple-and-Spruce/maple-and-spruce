/**
 * Factory for the Square mock server.
 *
 * Registers Square API routes and exposes a reset() helper for test
 * suites to clear per-test state without restarting the HTTP server.
 */
import { SquareMockServer } from './square-mock-server';
import { registerSquareRoutes, resetSquareState } from './routes/square';
import {
  registerGiftCardPaymentRoutes,
  resetGiftCardPaymentState,
} from './routes/gift-card-payments';

export interface SquareMockInstance {
  server: SquareMockServer;
  reset: () => void;
}

export function createSquareMockServer(): SquareMockInstance {
  const server = new SquareMockServer();
  // First, so it can take the gift card requests it owns and pass the rest on.
  registerGiftCardPaymentRoutes(server);
  registerSquareRoutes(server);

  return {
    server,
    reset: () => {
      server.clearRequests();
      resetSquareState();
      resetGiftCardPaymentState();
    },
  };
}
