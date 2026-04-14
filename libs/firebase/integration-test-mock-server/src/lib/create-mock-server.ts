/**
 * Factory for creating a fully-configured mock server with all routes.
 */
import { MockServer } from './mock-server.js';
import { registerSquareRoutes, resetSquareState } from './routes/square.js';
import {
  registerWebflowRoutes,
  resetWebflowState,
} from './routes/webflow.js';

export interface MockServerInstance {
  server: MockServer;
  /** Reset all mock state (payments, CMS items, request log) */
  reset: () => void;
}

/**
 * Create a mock server with Square and Webflow routes registered.
 *
 * @example
 * ```typescript
 * const mock = createMockServer();
 * await mock.server.start(9999);
 *
 * // ... run tests ...
 *
 * // Assert on what was sent to Square
 * const paymentRequests = mock.server.getRequests('/v2/payments');
 *
 * // Reset between test suites
 * mock.reset();
 *
 * await mock.server.stop();
 * ```
 */
export function createMockServer(): MockServerInstance {
  const server = new MockServer();
  registerSquareRoutes(server);
  registerWebflowRoutes(server);

  return {
    server,
    reset: () => {
      server.clearRequests();
      resetSquareState();
      resetWebflowState();
    },
  };
}
