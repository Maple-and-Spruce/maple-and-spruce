/**
 * Standalone script to start the Square mock server for integration tests.
 *
 * Usage: npx tsx libs/firebase/square-test-mock-server/start.ts
 *
 * Starts on port 9997 (or SQUARE_MOCK_SERVER_PORT env var).
 */
import { createSquareMockServer } from './src/lib/create-square-mock-server.js';

const port = parseInt(process.env['SQUARE_MOCK_SERVER_PORT'] ?? '9997', 10);
const mock = createSquareMockServer();

async function main(): Promise<void> {
  await mock.server.start(port);
  console.log(`Square mock server running on http://localhost:${port}`);
  console.log(
    'Routes: orders, payments, refunds, catalog, inventory (/v2/*)'
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
  console.error('Failed to start Square mock server:', err);
  process.exit(1);
});
