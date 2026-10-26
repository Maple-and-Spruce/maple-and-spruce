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
  privateHourStarts,
  privateHoursClass,
  privateHourBooking,
} from '@maple/firebase/integration-test-utils';

import { seedDev, type PrivateHoursSeed } from './seed-dev';

async function seedEmulator(
  classId: string,
  hours: PrivateHoursSeed
): Promise<void> {
  await clearFirestoreEmulator();
  await Promise.all([
    setFirestoreDoc('classes', classId, PUBLISHED_CLASS),
    setFirestoreDoc('discounts', DISCOUNT_IDS.percent, PERCENT_DISCOUNT),
    setFirestoreDoc('discounts', DISCOUNT_IDS.amount, AMOUNT_DISCOUNT),
    setFirestoreDoc('classes', hours.classId, privateHoursClass(hours.starts)),
    setFirestoreDoc(
      'registrations',
      hours.bookingId,
      privateHourBooking(hours.classId, hours.starts[HELD_HOUR_INDEX])
    ),
  ]);
}

/**
 * Which seeded hour another group already holds, so the spec can see a
 * booked hour (and join its waitlist). The spec books hour 0.
 */
const HELD_HOUR_INDEX = 1;

async function globalSetup(): Promise<void> {
  const target = process.env['E2E_TARGET'] ?? 'emulator';
  const classId = `test-class-${randomUUID()}`;
  // Private group hours: its own class, a held hour, and the hour list,
  // published so the spec books and checks the same hours.
  const runId = randomUUID();
  const hours: PrivateHoursSeed = {
    classId: `test-hours-class-${runId}`,
    bookingId: `test-hours-held-${runId}`,
    starts: privateHourStarts(),
  };

  // Publish the dynamic ID so workers + globalTeardown can read it.
  // process.env mutations in globalSetup propagate to spawned Playwright
  // workers because Playwright forwards parent env at spawn time.
  process.env['TEST_CLASS_ID'] = classId;
  process.env['TEST_HOURS_CLASS_ID'] = hours.classId;
  process.env['TEST_HOURS_STARTS'] = JSON.stringify(
    hours.starts.map((d) => d.toISOString())
  );
  process.env['TEST_HOURS_HELD_INDEX'] = String(HELD_HOUR_INDEX);

  console.log(`[e2e] Seeding fixtures for target=${target}, classId=${classId}…`);

  if (target === 'dev') {
    await seedDev(classId, hours, HELD_HOUR_INDEX);
  } else {
    await seedEmulator(classId, hours);
  }

  console.log(
    `[e2e] Seeded class=${classId}, discounts=[${DISCOUNT_IDS.percent}, ${DISCOUNT_IDS.amount}]`
  );
}

export default globalSetup;
