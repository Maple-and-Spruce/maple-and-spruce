/**
 * Standalone script to start the Webflow mock server for integration tests.
 *
 * Usage: npx tsx libs/firebase/webflow-test-mock-server/start.ts
 *
 * Starts on port 9996 (or WEBFLOW_MOCK_SERVER_PORT env var).
 */
import { createWebflowMockServer } from './src/lib/create-webflow-mock-server.js';

const port = parseInt(process.env['WEBFLOW_MOCK_SERVER_PORT'] ?? '9996', 10);
const mock = createWebflowMockServer();

async function main(): Promise<void> {
  await mock.server.start(port);
  console.log(`Webflow mock server running on http://localhost:${port}`);
  console.log('Routes: CMS items (/collections/*)');

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
  console.error('Failed to start Webflow mock server:', err);
  process.exit(1);
});
