/**
 * Playwright globalSetup: seed test fixtures before tests run.
 *
 * Two modes, picked by `E2E_TARGET`:
 * - default / `emulator` — seed the local Firestore emulator via REST
 *   (full wipe + reseed, fast and isolated).
 * - `dev` — seed the deployed `maple-and-spruce-dev` project via the
 *   Admin SDK. Idempotent: writes specific doc IDs without wiping the
 *   collection (we don't want to nuke dev data that isn't ours).
 *
 * The class doc gets a UUID-suffixed ID per run so concurrent runs
 * (or sequential runs that haven't been torn down yet) don't collide.
 * The ID is published via process.env.TEST_CLASS_ID so the spec and
 * teardown can pick it up. Discounts keep deterministic IDs because
 * the specs reference them by *code* (`SAVE10`, `TENOFF`), not doc ID.
 *
 * Same fixture set in both modes (shared from
 * `@maple/firebase/integration-test-utils`) so the spec assertions
 * don't have to know which backend they're running against.
 */
import { randomUUID } from 'node:crypto';

import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  PUBLISHED_CLASS,
  DISCOUNT_IDS,
  PERCENT_DISCOUNT,
  AMOUNT_DISCOUNT,
} from '@maple/firebase/integration-test-utils';

import { seedDev } from './seed-dev';

async function seedEmulator(classId: string): Promise<void> {
  await clearFirestoreEmulator();
  await Promise.all([
    setFirestoreDoc('classes', classId, PUBLISHED_CLASS),
    setFirestoreDoc('discounts', DISCOUNT_IDS.percent, PERCENT_DISCOUNT),
    setFirestoreDoc('discounts', DISCOUNT_IDS.amount, AMOUNT_DISCOUNT),
  ]);
}

async function globalSetup(): Promise<void> {
  const target = process.env['E2E_TARGET'] ?? 'emulator';
  const classId = `test-class-${randomUUID()}`;

  // Publish the dynamic ID so workers + globalTeardown can read it.
  // process.env mutations in globalSetup propagate to spawned Playwright
  // workers because Playwright forwards parent env at spawn time.
  process.env['TEST_CLASS_ID'] = classId;

  console.log(`[e2e] Seeding fixtures for target=${target}, classId=${classId}…`);

  if (target === 'dev') {
    await seedDev(classId);
  } else {
    await seedEmulator(classId);
  }

  console.log(
    `[e2e] Seeded class=${classId}, discounts=[${DISCOUNT_IDS.percent}, ${DISCOUNT_IDS.amount}]`
  );
}

export default globalSetup;
