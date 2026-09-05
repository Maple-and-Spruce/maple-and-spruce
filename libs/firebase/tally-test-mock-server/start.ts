/**
 * Standalone script to start the Tally mock server for integration tests.
 *
 * Usage: npx tsx libs/firebase/tally-test-mock-server/start.ts
 *
 * Starts on port 9993 (or TALLY_MOCK_SERVER_PORT env var).
 */
import { createTallyMockServer } from './src/lib/tally-mock-server.js';

const port = parseInt(process.env['TALLY_MOCK_SERVER_PORT'] ?? '9993', 10);
const mock = createTallyMockServer();

async function main(): Promise<void> {
  await mock.server.start(port);
  console.log(`Tally mock server running on http://localhost:${port}`);
  console.log('Routes: GET /forms/:formId/submissions');

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
  console.error('Failed to start Tally mock server:', err);
  process.exit(1);
});
