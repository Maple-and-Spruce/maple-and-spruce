/**
 * Factory for the Square mock server.
 *
 * Registers Square API routes and exposes a reset() helper for test
 * suites to clear per-test state without restarting the HTTP server.
 */
import { SquareMockServer } from './square-mock-server';
import { registerSquareRoutes, resetSquareState } from './routes/square';

export interface SquareMockInstance {
  server: SquareMockServer;
  reset: () => void;
}

export function createSquareMockServer(): SquareMockInstance {
  const server = new SquareMockServer();
  registerSquareRoutes(server);

  return {
    server,
    reset: () => {
      server.clearRequests();
      resetSquareState();
    },
  };
}
