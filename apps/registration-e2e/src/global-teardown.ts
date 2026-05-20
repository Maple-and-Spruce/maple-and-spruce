/**
 * Playwright globalTeardown: clean up seeded test data after the run.
 *
 * Emulator mode: nothing to do — the emulator process exits with the
 * job, taking all Firestore state with it.
 *
 * Dev mode: delete the seeded class + any registrations the Pay-flow
 * specs created against it. Without this, every run accumulates real
 * Firestore docs and Square sandbox orders against the same merchant.
 * Discount fixtures are intentionally left alone (stable, idempotent
 * across runs).
 *
 * Idempotent — runs even if globalSetup failed half-way. The class ID
 * is read from process.env.TEST_CLASS_ID; if unset (setup never ran),
 * teardown no-ops.
 */
import { teardownDev } from './seed-dev';

async function globalTeardown(): Promise<void> {
  const target = process.env['E2E_TARGET'] ?? 'emulator';
  const classId = process.env['TEST_CLASS_ID'];

  if (target !== 'dev') {
    return;
  }

  if (!classId) {
    console.warn('[e2e] No TEST_CLASS_ID in env — skipping dev teardown');
    return;
  }

  console.log(`[e2e] Tearing down dev fixtures for classId=${classId}…`);
  try {
    await teardownDev(classId);
    console.log(`[e2e] Removed class=${classId} + any registrations`);
  } catch (err) {
    // Don't fail the whole job on a teardown hiccup — the test result
    // is the signal. Surface the error so it's visible in the log.
    console.error('[e2e] teardown failed (continuing):', err);
  }
}

export default globalTeardown;
