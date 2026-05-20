/**
 * Standalone script to start the Meta CAPI mock server for integration tests.
 *
 * Usage: npx tsx libs/firebase/meta-capi-test-mock-server/start.ts
 *
 * Starts on port 9994 (or META_CAPI_MOCK_SERVER_PORT env var).
 */
import { createMetaCapiMockServer } from './src/lib/meta-capi-mock-server.js';

const port = parseInt(
  process.env['META_CAPI_MOCK_SERVER_PORT'] ?? '9994',
  10
);
const mock = createMetaCapiMockServer();

async function main(): Promise<void> {
  await mock.server.start(port);
  console.log(`Meta CAPI mock server running on http://localhost:${port}`);
  console.log('Routes: POST /v{N.N}/{pixelId}/events');

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
  console.error('Failed to start Meta CAPI mock server:', err);
  process.exit(1);
});
