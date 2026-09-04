/**
 * Playwright globalTeardown: clean up seeded MT test data after the run.
 *
 * Emulator mode: nothing to do — the emulator exits with the job, taking all
 * Firestore state with it.
 *
 * Dev mode: delete the seeded section + any registrations + scheduled charges
 * the Pay-flow specs created against it. Without this, every run accumulates
 * real Firestore docs and MT Square sandbox orders.
 *
 * Idempotent — runs even if globalSetup failed half-way. The section ID is read
 * from process.env.TEST_MT_SECTION_ID; if unset (setup never ran), no-ops.
 */
import { teardownDev } from './seed-dev';

async function globalTeardown(): Promise<void> {
  const target = process.env['E2E_TARGET'] ?? 'emulator';
  const sectionId = process.env['TEST_MT_SECTION_ID'];
  const discountCode = process.env['TEST_MT_DISCOUNT_CODE'];

  if (target !== 'dev') {
    return;
  }

  if (!sectionId) {
    console.warn('[mt-e2e] No TEST_MT_SECTION_ID in env — skipping dev teardown');
    return;
  }

  console.log(`[mt-e2e] Tearing down dev fixtures for sectionId=${sectionId}…`);
  try {
    await teardownDev(sectionId, discountCode);
  } catch (err) {
    // Don't fail the whole job on a teardown hiccup — the test result is the
    // signal. Surface the error so it's visible in the log.
    console.error('[mt-e2e] teardown failed (continuing):', err);
  }
}

export default globalTeardown;
