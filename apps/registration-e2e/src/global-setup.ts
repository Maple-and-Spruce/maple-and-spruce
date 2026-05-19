/**
 * Playwright globalSetup: seed test fixtures before tests run.
 *
 * Two modes, picked by `E2E_TARGET`:
 * - default / `emulator` — seed the local Firestore emulator via REST
 *   (full wipe + reseed, fast and isolated).
 * - `dev` — seed the deployed `maple-and-spruce-dev` project via the
 *   Admin SDK. Overwrites the same deterministic IDs each run rather
 *   than wiping the collection (we don't want to nuke dev data that
 *   isn't ours).
 *
 * Same fixture set in both modes (shared from
 * `@maple/firebase/integration-test-utils`) so the spec assertions
 * don't have to know which backend they're running against.
 */
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  CLASS_IDS,
  PUBLISHED_CLASS,
  DISCOUNT_IDS,
  PERCENT_DISCOUNT,
  AMOUNT_DISCOUNT,
} from '@maple/firebase/integration-test-utils';

import { seedDev } from './seed-dev';

async function seedEmulator(): Promise<void> {
  await clearFirestoreEmulator();
  await Promise.all([
    setFirestoreDoc('classes', CLASS_IDS.published, PUBLISHED_CLASS),
    setFirestoreDoc('discounts', DISCOUNT_IDS.percent, PERCENT_DISCOUNT),
    setFirestoreDoc('discounts', DISCOUNT_IDS.amount, AMOUNT_DISCOUNT),
  ]);
}

async function globalSetup(): Promise<void> {
  const target = process.env['E2E_TARGET'] ?? 'emulator';
  console.log(`[e2e] Seeding fixtures for target=${target}…`);

  if (target === 'dev') {
    await seedDev();
  } else {
    await seedEmulator();
  }

  console.log(
    `[e2e] Seeded class=${CLASS_IDS.published}, discounts=[${DISCOUNT_IDS.percent}, ${DISCOUNT_IDS.amount}]`
  );
}

export default globalSetup;
