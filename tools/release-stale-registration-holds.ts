/**
 * Release abandoned hosted-checkout holds in dev, by hand.
 *
 * Scheduled functions deploy to prod only (`tools/list-prod-only-functions.ts`),
 * so dev has no `releaseStaleRegistrationHolds` job. A `pending` registration
 * left behind by an abandoned hosted checkout in dev therefore holds its class
 * spot until something cancels it. This runs the same logic the prod job runs
 * every 5 minutes: `pending`, unpaid, older than 15 minutes -> `cancelled`,
 * each re-read in a transaction so a paid registration is never touched.
 *
 * Credentials: Application Default Credentials
 *   (gcloud auth application-default login)
 *
 * Usage:
 *   npx tsx tools/release-stale-registration-holds.ts            # dry run: count stale holds
 *   npx tsx tools/release-stale-registration-holds.ts --execute  # release them
 *
 * Dev only. Prod has the schedule; there is no reason to run this against it.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { releaseStaleHolds } from '@maple/firebase/maple-functions/release-stale-registration-holds';

const PROJECT_ID = 'maple-and-spruce-dev';
const HOLD_TTL_MINUTES = 15;

async function main(): Promise<void> {
  const db = getFirestore(initializeApp({ projectId: PROJECT_ID }));

  if (!process.argv.includes('--execute')) {
    const cutoff = new Date(Date.now() - HOLD_TTL_MINUTES * 60 * 1000);
    const snapshot = await db
      .collection('registrations')
      .where('status', '==', 'pending')
      .where('createdAt', '<', cutoff)
      .get();
    console.log(
      `${PROJECT_ID}: ${snapshot.size} pending registration(s) older than ${HOLD_TTL_MINUTES} minutes (dry run).`
    );
    console.log('Re-run with --execute to release the unpaid ones.');
    return;
  }

  const { found, released } = await releaseStaleHolds(db);
  console.log(`${PROJECT_ID}: released ${released} of ${found} stale pending hold(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
