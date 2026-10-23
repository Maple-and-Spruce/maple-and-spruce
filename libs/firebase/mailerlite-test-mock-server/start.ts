/**
 * Standalone script to start the MailerLite mock server for integration tests.
 *
 * Usage: npx tsx libs/firebase/mailerlite-test-mock-server/start.ts
 *
 * Starts on port 9992 (or MAILERLITE_MOCK_SERVER_PORT env var).
 */
import { createMailerLiteMockServer } from './src/lib/mailerlite-mock-server.js';

const port = parseInt(process.env['MAILERLITE_MOCK_SERVER_PORT'] ?? '9992', 10);
const mock = createMailerLiteMockServer();

async function main(): Promise<void> {
  await mock.server.start(port);
  console.log(`MailerLite mock server running on http://localhost:${port}`);
  console.log(
    'Routes: POST /api/ecommerce/shops/:shopId/{products,orders}, PUT .../orders/:id',
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
  console.error('Failed to start MailerLite mock server:', err);
  process.exit(1);
});
