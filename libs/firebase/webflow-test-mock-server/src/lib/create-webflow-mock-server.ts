/**
 * Factory for the Webflow mock server.
 *
 * Registers Webflow CMS routes and exposes a reset() helper for test
 * suites to clear per-test state without restarting the HTTP server.
 */
import { WebflowMockServer } from './webflow-mock-server';
import { registerWebflowRoutes, resetWebflowState } from './routes/webflow';

export interface WebflowMockInstance {
  server: WebflowMockServer;
  reset: () => void;
}

export function createWebflowMockServer(): WebflowMockInstance {
  const server = new WebflowMockServer();
  registerWebflowRoutes(server);

  return {
    server,
    reset: () => {
      server.clearRequests();
      resetWebflowState();
    },
  };
}
