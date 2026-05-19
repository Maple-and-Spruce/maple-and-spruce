/**
 * Playwright globalSetup: seed the Firebase emulator before tests run.
 *
 * Reuses the fixtures and helpers from `@maple/firebase/integration-test-utils`
 * so the seeded state is identical to what the cloud-function integration
 * tests assume. Keeping a single source of fixture truth means a future
 * fixture rename only has to happen once.
 *
 * Idempotent by design — `clearFirestoreEmulator` wipes everything first,
 * so re-running locally against a long-lived emulator session is safe.
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

async function globalSetup(): Promise<void> {
  // eslint-disable-next-line no-console -- visible test-run progress
  console.log('[e2e] Seeding Firestore emulator…');
  await clearFirestoreEmulator();

  await Promise.all([
    setFirestoreDoc('classes', CLASS_IDS.published, PUBLISHED_CLASS),
    setFirestoreDoc('discounts', DISCOUNT_IDS.percent, PERCENT_DISCOUNT),
    setFirestoreDoc('discounts', DISCOUNT_IDS.amount, AMOUNT_DISCOUNT),
  ]);

  // eslint-disable-next-line no-console
  console.log(
    `[e2e] Seeded class=${CLASS_IDS.published}, discounts=[${DISCOUNT_IDS.percent}, ${DISCOUNT_IDS.amount}]`
  );
}

export default globalSetup;
