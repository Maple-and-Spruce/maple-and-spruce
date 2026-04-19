/**
 * Thin client for interacting with the Etsy mock server *from the test
 * process*. The mock server itself runs in its own process (started via
 * tools/run-integration-tests.sh), so tests POST fixture updates to it
 * over HTTP and read recorded requests the same way.
 *
 * Endpoints added here are served by a tiny admin router registered in
 * create-etsy-mock-server so tests can drive the mock's state without
 * any shared-memory coupling.
 */
import { EMULATOR_CONFIG } from '@maple/firebase/integration-test-utils';
import type { MockListingSeed } from '@maple/firebase/etsy-test-mock-server';

export async function setMockListings(seeds: MockListingSeed[]): Promise<void> {
  const res = await fetch(
    `${EMULATOR_CONFIG.etsyMockServerUrl}/_mock/listings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seeds }),
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to seed listings: ${res.status} ${await res.text()}`);
  }
}

export async function resetMock(): Promise<void> {
  const res = await fetch(
    `${EMULATOR_CONFIG.etsyMockServerUrl}/_mock/reset`,
    { method: 'POST' }
  );
  if (!res.ok) {
    throw new Error(`Failed to reset mock: ${res.status}`);
  }
}
