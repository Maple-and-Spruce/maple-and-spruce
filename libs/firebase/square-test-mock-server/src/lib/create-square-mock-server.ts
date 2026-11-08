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
import { registerGiftCardRoutes, resetGiftCardState } from './routes/gift-cards';

export interface SquareMockInstance {
  server: SquareMockServer;
  reset: () => void;
}

export function createSquareMockServer(): SquareMockInstance {
  const server = new SquareMockServer();
  // First: the gift card routes answer their own requests on shared paths
  // (`POST /v2/orders`, `POST /v2/payments`) and pass the rest on. Gift card
  // sales (#300) before gift card payments (#301), both before `square.ts`.
  registerGiftCardRoutes(server);
  registerGiftCardPaymentRoutes(server);
  registerSquareRoutes(server);

  return {
    server,
    reset: () => {
      server.clearRequests();
      resetSquareState();
      resetGiftCardPaymentState();
      resetGiftCardState();
    },
  };
}
