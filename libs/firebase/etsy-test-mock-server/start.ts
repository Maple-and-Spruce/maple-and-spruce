/**
 * Standalone script to start the Etsy mock server for integration tests.
 *
 * Usage: npx tsx libs/firebase/etsy-test-mock-server/start.ts
 *
 * Starts on port 9998 (or ETSY_MOCK_SERVER_PORT env var).
 * One of three per-service mock servers (Square :9997, Webflow :9996, Etsy :9998).
 */
import { createEtsyMockServer } from './src/lib/create-etsy-mock-server.js';

const port = parseInt(process.env['ETSY_MOCK_SERVER_PORT'] ?? '9998', 10);
const mock = createEtsyMockServer();

async function main(): Promise<void> {
  await mock.server.start(port);
  console.log(`Etsy mock server running on http://localhost:${port}`);
  console.log(
    'Routes: listings (/v3/application/*), OAuth (/v3/public/oauth/*), mock images (/mock-images/*)'
  );

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
  console.error('Failed to start Etsy mock server:', err);
  process.exit(1);
});
