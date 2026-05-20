/**
 * Standalone script to start the GA4 mock server for integration tests.
 *
 * Usage: npx tsx libs/firebase/ga4-test-mock-server/start.ts
 *
 * Starts on port 9995 (or GA4_MOCK_SERVER_PORT env var).
 */
import { createGa4MockServer } from './src/lib/ga4-mock-server.js';

const port = parseInt(process.env['GA4_MOCK_SERVER_PORT'] ?? '9995', 10);
const mock = createGa4MockServer();

async function main(): Promise<void> {
  await mock.server.start(port);
  console.log(`GA4 mock server running on http://localhost:${port}`);
  console.log('Routes: POST /mp/collect');

  process.on('SIGINT', async () => {
    await mock.server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await mock.server.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start GA4 mock server:', err);
  process.exit(1);
});
