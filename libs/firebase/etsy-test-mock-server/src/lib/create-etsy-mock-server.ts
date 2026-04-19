/**
 * Factory for the Etsy mock server.
 *
 * Registers listing + OAuth routes and exposes a reset() helper for test
 * suites to clear per-test state without restarting the HTTP server.
 */
import { EtsyMockServer } from './etsy-mock-server';
import { registerEtsyListingRoutes } from './routes/etsy-listings';
import {
  registerEtsyOAuthRoutes,
  resetOAuthState,
} from './routes/etsy-oauth';
import { clearListings } from './listing-fixtures';

export interface EtsyMockInstance {
  server: EtsyMockServer;
  reset: () => void;
}

export function createEtsyMockServer(): EtsyMockInstance {
  const server = new EtsyMockServer();
  registerEtsyListingRoutes(server);
  registerEtsyOAuthRoutes(server);

  return {
    server,
    reset: () => {
      server.clearRequests();
      clearListings();
      resetOAuthState();
    },
  };
}
