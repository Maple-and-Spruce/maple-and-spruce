/**
 * Playwright globalSetup: seed the Music Together section the enrollment E2E
 * registers against.
 *
 * Two modes, picked by `E2E_TARGET`:
 * - default / `emulator` — full wipe + reseed the local Firestore emulator via
 *   REST (fast and isolated).
 * - `dev` — seed the deployed `maple-and-spruce-dev` project via the Admin SDK
 *   (idempotent; writes a per-run doc ID without wiping the collection).
 *
 * The section doc gets a UUID-suffixed ID per run so concurrent runs (and the
 * post-run teardown) can attribute registrations to the right suite. The ID is
 * published via `process.env.TEST_MT_SECTION_ID` for the spec + teardown.
 */
import { randomUUID } from 'node:crypto';

import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  PUBLISHED_MT_SECTION,
} from '@maple/firebase/integration-test-utils';

import { seedDev } from './seed-dev';

async function seedEmulator(sectionId: string): Promise<void> {
  await clearFirestoreEmulator();
  await setFirestoreDoc(
    'musicTogetherSections',
    sectionId,
    PUBLISHED_MT_SECTION
  );
}

async function globalSetup(): Promise<void> {
  const target = process.env['E2E_TARGET'] ?? 'emulator';
  const sectionId = `test-mt-section-${randomUUID()}`;

  // process.env mutations in globalSetup propagate to spawned Playwright
  // workers (Playwright forwards parent env at spawn time).
  process.env['TEST_MT_SECTION_ID'] = sectionId;

  console.log(
    `[mt-e2e] Seeding MT section for target=${target}, sectionId=${sectionId}…`
  );

  if (target === 'dev') {
    await seedDev(sectionId);
  } else {
    await seedEmulator(sectionId);
  }

  console.log(`[mt-e2e] Seeded MT section=${sectionId}`);
}

export default globalSetup;
