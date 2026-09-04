/**
 * Seed / tear down the deployed dev Firestore for the MT enrollment E2E.
 *
 * Used when E2E_TARGET=dev. Talks to the real `maple-and-spruce-dev` Firestore
 * via Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS in CI via
 * google-github-actions/auth, or `gcloud auth application-default login`
 * locally).
 *
 * The section doc ID is unique per run (generated in globalSetup) so concurrent
 * CI runs can't collide and the registrations + scheduled charges created
 * during the suite can be cleanly attributed and deleted afterward.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  PUBLISHED_MT_SECTION,
  mtPilotDiscountDoc,
} from '@maple/firebase/integration-test-utils';

const DEV_PROJECT_ID = 'maple-and-spruce-dev';

function getAdminDb() {
  if (getApps().length === 0) {
    initializeApp({ projectId: DEV_PROJECT_ID });
  }
  return getFirestore();
}

/**
 * Retry a Firestore operation on transient connection failures. In CI the
 * Admin SDK gets credentials keylessly (Workload Identity Federation); the
 * first STS token exchange intermittently drops with "Premature close" — a
 * connection blip, not an auth/quota error. Mirrors registration-e2e/seed-dev.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        /Premature close|metadata from plugin|sts\.googleapis\.com|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|UNAVAILABLE|DEADLINE_EXCEEDED|Getting metadata|503|429/i.test(
          msg
        );
      if (!transient || attempt === MAX_ATTEMPTS) break;
      const delayMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      console.warn(
        `[mt-e2e] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed (${msg}); retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

export async function seedDev(
  sectionId: string,
  discountCode: string
): Promise<void> {
  const db = getAdminDb();
  await withRetry('seedDev', () =>
    db.collection('musicTogetherSections').doc(sectionId).set(PUBLISHED_MT_SECTION)
  );
  await withRetry('seedDev:discount', () =>
    db
      .collection('discounts')
      .doc(discountDocId(discountCode))
      .set(mtPilotDiscountDoc(discountCode))
  );
}

/** Deterministic doc id so teardown can delete the code without a query. */
function discountDocId(discountCode: string): string {
  return `test-mt-discount-${discountCode}`;
}

/**
 * Remove the seeded section plus any registrations + scheduled charges it
 * accumulated during the run. Idempotent: missing docs are silently ignored.
 *
 * The registration + charge cleanup matters: the Pay-flow specs create real MT
 * Square sandbox orders + Firestore docs. Without this they'd pile up in dev.
 */
export async function teardownDev(
  sectionId: string,
  discountCode?: string
): Promise<void> {
  const db = getAdminDb();

  const regs = await withRetry('teardownDev:queryRegs', () =>
    db
      .collection('musicTogetherRegistrations')
      .where('sectionId', '==', sectionId)
      .get()
  );
  const regIds = regs.docs.map((d) => d.id);
  await withRetry('teardownDev:deleteRegs', () =>
    Promise.all(regs.docs.map((d) => d.ref.delete()))
  );

  // Scheduled charges are keyed by sectionId too — delete them directly.
  const charges = await withRetry('teardownDev:queryCharges', () =>
    db
      .collection('musicTogetherScheduledCharges')
      .where('sectionId', '==', sectionId)
      .get()
  );
  await withRetry('teardownDev:deleteCharges', () =>
    Promise.all(charges.docs.map((d) => d.ref.delete()))
  );

  await withRetry('teardownDev:deleteSection', () =>
    db.collection('musicTogetherSections').doc(sectionId).delete()
  );

  // Leaving the code behind would let a later run's family redeem it, and
  // would slowly fill the dev Discounts page with E2E noise.
  if (discountCode) {
    await withRetry('teardownDev:deleteDiscount', () =>
      db.collection('discounts').doc(discountDocId(discountCode)).delete()
    );
  }

  console.log(
    `[mt-e2e] teardownDev removed section=${sectionId}, registrations=${regIds.length}, charges=${charges.size}`
  );
}
