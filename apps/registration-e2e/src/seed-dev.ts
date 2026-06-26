/**
 * Seed the deployed dev Firestore via Admin SDK.
 *
 * Used by globalSetup when E2E_TARGET=dev. Talks to the real
 * `maple-and-spruce-dev` Firestore — auth comes from Application
 * Default Credentials (GOOGLE_APPLICATION_CREDENTIALS in CI via
 * google-github-actions/auth, or `gcloud auth application-default
 * login` locally).
 *
 * The class doc ID is unique per run (generated in globalSetup) so
 * concurrent CI runs can't collide and the Pay-flow registrations
 * created during the suite can be cleanly attributed/deleted. Discount
 * fixtures use deterministic IDs and are simply overwritten each run
 * — they're stable code fixtures, not per-run data.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  PUBLISHED_CLASS,
  DISCOUNT_IDS,
  PERCENT_DISCOUNT,
  AMOUNT_DISCOUNT,
} from '@maple/firebase/integration-test-utils';

const DEV_PROJECT_ID = 'maple-and-spruce-dev';

function getAdminDb() {
  if (getApps().length === 0) {
    // In CI, firebase-admin's own keyless token exchange against
    // sts.googleapis.com fails ("Premature close") — so the workflow mints an
    // access token (google-github-actions/auth token_format: access_token, the
    // same reliable path the deploy jobs use) and passes it here. When present,
    // authenticate with it directly and skip the SDK's in-process exchange.
    const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    if (accessToken) {
      initializeApp({
        projectId: DEV_PROJECT_ID,
        credential: {
          getAccessToken: async () => ({
            access_token: accessToken,
            expires_in: 3600,
          }),
        },
      });
    } else {
      // Local dev: Application Default Credentials (`gcloud auth
      // application-default login`). Explicit projectId avoids the "could not
      // load default credentials" error when env carries an SA JSON without an
      // embedded project_id (as in some Workload Identity flows).
      initializeApp({ projectId: DEV_PROJECT_ID });
    }
  }
  return getFirestore();
}

/**
 * Retry a Firestore operation on transient connection failures.
 *
 * In CI the Admin SDK gets credentials keylessly: the first call triggers a
 * token exchange against sts.googleapis.com (Workload Identity Federation),
 * and that HTTPS call intermittently drops with "Premature close" — a
 * connection-layer blip, NOT a quota/auth error. gax's built-in retries don't
 * always ride it out, which fails the whole E2E suite at setup/teardown. Retry
 * with exponential backoff so a momentary STS hiccup doesn't sink the run;
 * non-transient errors (e.g. permission denied) throw immediately.
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
        `[e2e] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed (${msg}); retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

export async function seedDev(classId: string): Promise<void> {
  const db = getAdminDb();
  await withRetry('seedDev', () =>
    Promise.all([
      db.collection('classes').doc(classId).set(PUBLISHED_CLASS),
      db
        .collection('discounts')
        .doc(DISCOUNT_IDS.percent)
        .set(PERCENT_DISCOUNT),
      db.collection('discounts').doc(DISCOUNT_IDS.amount).set(AMOUNT_DISCOUNT),
    ])
  );
}

/**
 * Remove the seeded class plus any registrations it accumulated during
 * the run. Discount fixtures are left alone — they're stable. Idempotent:
 * missing docs are silently ignored by Firestore.
 *
 * The registration cleanup matters: Pay-flow specs create real Square
 * sandbox orders + Firestore registration docs. Without this they'd
 * pile up in dev indefinitely.
 */
export async function teardownDev(classId: string): Promise<void> {
  const db = getAdminDb();

  const regs = await withRetry('teardownDev:query', () =>
    db.collection('registrations').where('classId', '==', classId).get()
  );
  await withRetry('teardownDev:deleteRegistrations', () =>
    Promise.all(regs.docs.map((d) => d.ref.delete()))
  );

  await withRetry('teardownDev:deleteClass', () =>
    db.collection('classes').doc(classId).delete()
  );
}
