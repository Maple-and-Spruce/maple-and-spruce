/**
 * Seed the deployed dev Firestore via Admin SDK.
 *
 * Used by globalSetup when E2E_TARGET=dev. Talks to the real
 * `maple-and-spruce-dev` Firestore — auth comes from Application
 * Default Credentials (GOOGLE_APPLICATION_CREDENTIALS in CI via
 * google-github-actions/auth, or `gcloud auth application-default
 * login` locally).
 *
 * Idempotent: re-running overwrites the same doc IDs. The fixture
 * IDs are deterministic (`test-class-published`, etc.) so the
 * Webflow sync triggers find/update the same CMS item each run
 * rather than accumulating new ones — and because dev syncs with
 * isDev=true, those items are CMS drafts, never published to the
 * live site (see libs/firebase/maple-functions/sync-class-to-webflow).
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  CLASS_IDS,
  PUBLISHED_CLASS,
  DISCOUNT_IDS,
  PERCENT_DISCOUNT,
  AMOUNT_DISCOUNT,
} from '@maple/firebase/integration-test-utils';

const DEV_PROJECT_ID = 'maple-and-spruce-dev';

function getAdminDb() {
  if (getApps().length === 0) {
    // `applicationDefault()` would work too, but being explicit about
    // projectId avoids the "could not load default credentials" error
    // when env carries a service account JSON without an embedded
    // project_id (which is the case for some Workload Identity flows).
    initializeApp({ projectId: DEV_PROJECT_ID });
  }
  return getFirestore();
}

export async function seedDev(): Promise<void> {
  const db = getAdminDb();
  await Promise.all([
    db.collection('classes').doc(CLASS_IDS.published).set(PUBLISHED_CLASS),
    db.collection('discounts').doc(DISCOUNT_IDS.percent).set(PERCENT_DISCOUNT),
    db.collection('discounts').doc(DISCOUNT_IDS.amount).set(AMOUNT_DISCOUNT),
  ]);
}
