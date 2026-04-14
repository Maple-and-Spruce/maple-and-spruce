/**
 * Standalone script to start the mock server.
 *
 * Usage: npx tsx libs/firebase/integration-test-mock-server/start.ts
 *
 * Starts on port 9999 (or MOCK_SERVER_PORT env var).
 * Logs all requests to stdout for debugging.
 */
import { createMockServer } from './src/lib/create-mock-server.js';

const port = parseInt(process.env['MOCK_SERVER_PORT'] ?? '9999', 10);
const mock = createMockServer();

async function main(): Promise<void> {
  await mock.server.start(port);
  console.log(`Mock server running on http://localhost:${port}`);
  console.log('Routes: Square (/v2/*), Webflow (/collections/*)');

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
  console.error('Failed to start mock server:', err);
  process.exit(1);
});
