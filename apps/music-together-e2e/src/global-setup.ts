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
  mtPilotDiscountDoc,
} from '@maple/firebase/integration-test-utils';

import { seedDev } from './seed-dev';

async function seedEmulator(
  sectionId: string,
  discountCode: string
): Promise<void> {
  await clearFirestoreEmulator();
  await setFirestoreDoc(
    'musicTogetherSections',
    sectionId,
    PUBLISHED_MT_SECTION
  );
  await setFirestoreDoc(
    'discounts',
    `test-mt-discount-${discountCode}`,
    mtPilotDiscountDoc(discountCode)
  );
}

async function globalSetup(): Promise<void> {
  const target = process.env['E2E_TARGET'] ?? 'emulator';
  const sectionId = `test-mt-section-${randomUUID()}`;
  // Discount codes are globally unique, so the E2E's code must be unique per
  // run or two concurrent CI runs would collide on it. Letters only: the
  // validation suite's code pattern is [A-Za-z0-9-].
  const discountCode = `E2EPILOT${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  // process.env mutations in globalSetup propagate to spawned Playwright
  // workers (Playwright forwards parent env at spawn time).
  process.env['TEST_MT_SECTION_ID'] = sectionId;
  process.env['TEST_MT_DISCOUNT_CODE'] = discountCode;

  console.log(
    `[mt-e2e] Seeding MT section for target=${target}, sectionId=${sectionId}…`
  );

  if (target === 'dev') {
    await seedDev(sectionId, discountCode);
  } else {
    await seedEmulator(sectionId, discountCode);
  }

  console.log(
    `[mt-e2e] Seeded MT section=${sectionId}, discount=${discountCode}`
  );
}

export default globalSetup;
