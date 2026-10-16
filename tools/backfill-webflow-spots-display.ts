/**
 * One-time backfill for the Webflow `spots-display` / `spots-remaining` fields.
 *
 * The class → Webflow sync writes `spots-display` ("N spots remaining" or, for a
 * full class, the "Waitlist Available" string). That field only updates when a
 * class re-syncs (a class edit, or a registration changing the count). A class
 * that filled up before the copy change from "Class Full" → "Waitlist Available"
 * keeps showing the old string on the public listing indefinitely, because a
 * full class rarely gets another registration event to trigger a re-sync.
 *
 * This script recomputes spots for every synced class and PATCHes the Webflow
 * item wherever the live values drift from what the current count implies.
 * Only items that are already live are written (and, on --prod, republished).
 * Drafts (past, test and pilot classes, and every dev item) are skipped so
 * they stay unpublished; see `webflow-backfill-drafts.ts`. It duplicates the tiny `spots-display` string logic from
 * `class.service.ts` rather than importing `mapClassToFieldData`, because that
 * mapper expects `Date` sessions and Firestore hands back `Timestamp`s.
 *
 * Credentials:
 *   - Firebase: Application Default Credentials
 *       (gcloud auth application-default login)
 *   - Webflow: WEBFLOW_API_TOKEN + WEBFLOW_CLASSES_COLLECTION_ID env vars.
 *     Use the PROD Webflow token/collection when running with --prod. Values
 *     live in Firebase Secret Manager / the Functions env for each project.
 *
 * Usage:
 *   export WEBFLOW_API_TOKEN=...
 *   export WEBFLOW_CLASSES_COLLECTION_ID=...
 *   npx tsx tools/backfill-webflow-spots-display.ts                   # dry-run, dev
 *   npx tsx tools/backfill-webflow-spots-display.ts --prod            # dry-run, prod
 *   npx tsx tools/backfill-webflow-spots-display.ts --execute         # write, dev
 *   npx tsx tools/backfill-webflow-spots-display.ts --prod --execute  # write, prod
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { WebflowClient } from 'webflow-api';
import {
  readItemState,
  splitOutDrafts,
  updatePublishedItem,
} from './webflow-backfill-drafts';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const accessToken = process.env['WEBFLOW_API_TOKEN'];
const collectionId = process.env['WEBFLOW_CLASSES_COLLECTION_ID'];

if (!accessToken || !collectionId) {
  console.error(
    'WEBFLOW_API_TOKEN and WEBFLOW_CLASSES_COLLECTION_ID env vars are required.\n' +
      'Grab the values for the target project from its Functions env / Secret Manager.'
  );
  process.exit(1);
}

console.log(
  `Backfill Webflow spots-display on ${projectId} (${
    isExecute ? 'EXECUTE' : 'DRY-RUN'
  })`
);

const app = initializeApp({ projectId });
const db = getFirestore(app);
const webflow = new WebflowClient({ accessToken });

// Mirrors the count in RegistrationRepository.countByClassId: pending +
// confirmed registrations, summed by quantity.
const COUNTED_STATUSES = ['pending', 'confirmed'];

function spotsDisplayFor(spotsRemaining: number): string {
  return spotsRemaining <= 0
    ? 'Waitlist Available'
    : `${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} remaining`;
}

async function countRegistrations(classId: string): Promise<number> {
  const snapshot = await db
    .collection('registrations')
    .where('classId', '==', classId)
    .where('status', 'in', COUNTED_STATUSES)
    .get();
  return snapshot.docs.reduce(
    (sum, doc) => sum + ((doc.data()['quantity'] as number) || 1),
    0
  );
}

interface Row {
  id: string;
  name: string;
  webflowItemId: string;
  desiredDisplay: string;
  desiredRemaining: number;
  liveDisplay: string | undefined;
  liveRemaining: number | undefined;
  /** True when the Webflow item is an unpublished draft (past or test classes). */
  isDraft: boolean;
}

async function fetchLive(itemId: string): Promise<{
  display: string | undefined;
  remaining: number | undefined;
  isDraft: boolean;
}> {
  const { isDraft, fieldData } = await readItemState(
    webflow.collections.items,
    collectionId!,
    itemId
  );
  const display = fieldData['spots-display'];
  const remaining = fieldData['spots-remaining'];
  return {
    display: typeof display === 'string' ? display : undefined,
    remaining: typeof remaining === 'number' ? remaining : undefined,
    isDraft,
  };
}

async function main(): Promise<void> {
  const snap = await db.collection('classes').get();

  const candidates = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(
      (c) =>
        typeof c.data['webflowItemId'] === 'string' &&
        typeof c.data['capacity'] === 'number'
    );

  console.log(
    `${snap.size} classes total; ${candidates.length} synced with a capacity.`
  );

  const rows: Row[] = [];
  for (const c of candidates) {
    const webflowItemId = c.data['webflowItemId'] as string;
    const capacity = c.data['capacity'] as number;
    const count = await countRegistrations(c.id);
    const desiredRemaining = capacity - count;
    const live = await fetchLive(webflowItemId);
    rows.push({
      id: c.id,
      name: (c.data['name'] as string) ?? '(unnamed)',
      webflowItemId,
      desiredDisplay: spotsDisplayFor(desiredRemaining),
      desiredRemaining,
      liveDisplay: live.display,
      liveRemaining: live.remaining,
      isDraft: live.isDraft,
    });
  }

  // Drafts are unpublished on purpose; see webflow-backfill-drafts.ts.
  const { published: toUpdate, drafts: skippedDrafts } = splitOutDrafts(
    rows.filter(
      (r) =>
        r.liveDisplay !== r.desiredDisplay ||
        r.liveRemaining !== r.desiredRemaining
    )
  );

  console.log('');
  for (const r of toUpdate) {
    console.log(
      `  ${r.name}\n    display: ${r.liveDisplay ?? '(none)'} -> ${
        r.desiredDisplay
      }\n    remaining: ${r.liveRemaining ?? '(none)'} -> ${r.desiredRemaining}`
    );
  }

  console.log(
    `\n${toUpdate.length} published class(es) need a spots update; ${
      skippedDrafts.length
    } draft(s) skipped; ${
      rows.length - toUpdate.length - skippedDrafts.length
    } already correct.`
  );

  if (!isExecute) {
    console.log('\nDry-run only. Re-run with --execute to write.');
    return;
  }

  let written = 0;
  for (const r of toUpdate) {
    try {
      await updatePublishedItem(
        webflow.collections.items,
        collectionId!,
        r.webflowItemId,
        {
          'spots-display': r.desiredDisplay,
          'spots-remaining': r.desiredRemaining,
        },
        // Dev and prod share one Webflow site: a dev run never publishes.
        { publish: isProd }
      );
      written++;
    } catch (error) {
      console.warn(
        `  ! update/publish failed for ${r.name} (${r.webflowItemId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  console.log(
    `\nUpdated ${written} live Webflow item(s)${
      isProd ? ' and republished them' : ' (dev: not published)'
    }.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
