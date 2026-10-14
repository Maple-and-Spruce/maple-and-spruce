/**
 * One-time backfill for the Webflow `session-count` field on the Classes CMS.
 *
 * The class → Webflow sync now writes `session-count` (the number of scheduled
 * sessions). The redesigned /upcoming-classes listing reads it to tell
 * single-session "Try It" classes (1) from multi-session series such as the
 * Studio Series (> 1). Existing CMS items only pick the field up when their
 * class re-syncs, so this script fills it in for every synced class now.
 *
 * It recomputes the count the same way the repository's `parseSessions` does
 * (the `sessions` array, else 1 for a legacy single `dateTime`, else 0) rather
 * than importing `mapClassToFieldData`, because that mapper expects `Date`
 * sessions and Firestore hands back `Timestamp`s.
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
 *   npx tsx tools/backfill-webflow-session-count.ts                   # dry-run, dev
 *   npx tsx tools/backfill-webflow-session-count.ts --prod            # dry-run, prod
 *   npx tsx tools/backfill-webflow-session-count.ts --execute         # write, dev
 *   npx tsx tools/backfill-webflow-session-count.ts --prod --execute  # write, prod
 *
 * On --prod --execute each updated item is published; on dev, items are left
 * as drafts (as the sync does), so nothing reaches the shared live site.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { WebflowClient } from 'webflow-api';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const accessToken = process.env['WEBFLOW_API_TOKEN'];
const collectionIdEnv = process.env['WEBFLOW_CLASSES_COLLECTION_ID'];

if (!accessToken || !collectionIdEnv) {
  console.error(
    'WEBFLOW_API_TOKEN and WEBFLOW_CLASSES_COLLECTION_ID env vars are required.\n' +
      'Grab the values for the target project from its Functions env / Secret Manager.'
  );
  process.exit(1);
}
const collectionId: string = collectionIdEnv;

console.log(
  `Backfill Webflow session-count on ${projectId} (${
    isExecute ? 'EXECUTE' : 'DRY-RUN'
  })`
);

const app = initializeApp({ projectId });
const db = getFirestore(app);
const webflow = new WebflowClient({ accessToken });

/** Mirrors `parseSessions` in class.repository.ts. */
function sessionCountFor(data: Record<string, unknown>): number {
  const sessions = data['sessions'];
  if (Array.isArray(sessions) && sessions.length > 0) {
    return sessions.length;
  }
  const legacyDateTime = data['dateTime'];
  return legacyDateTime !== undefined && legacyDateTime !== null ? 1 : 0;
}

interface Row {
  id: string;
  name: string;
  webflowItemId: string;
  desired: number;
  live: number | undefined;
}

async function fetchLive(itemId: string): Promise<number | undefined> {
  try {
    const item = await webflow.collections.items.getItem(collectionId, itemId);
    const fieldData = item?.fieldData as
      | { 'session-count'?: unknown }
      | undefined;
    return typeof fieldData?.['session-count'] === 'number'
      ? (fieldData['session-count'] as number)
      : undefined;
  } catch (error) {
    console.warn(
      `  ! getItem failed for ${itemId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

async function main(): Promise<void> {
  const snap = await db.collection('classes').get();

  const candidates = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((c) => typeof c.data['webflowItemId'] === 'string');

  console.log(`${snap.size} classes total; ${candidates.length} synced to Webflow.`);

  const rows: Row[] = [];
  for (const c of candidates) {
    const webflowItemId = c.data['webflowItemId'] as string;
    rows.push({
      id: c.id,
      name: (c.data['name'] as string) ?? '(unnamed)',
      webflowItemId,
      desired: sessionCountFor(c.data),
      live: await fetchLive(webflowItemId),
    });
  }

  const toUpdate = rows.filter((r) => r.live !== r.desired);

  console.log('');
  for (const r of toUpdate) {
    console.log(`  ${r.name}\n    session-count: ${r.live ?? '(none)'} -> ${r.desired}`);
  }

  console.log(
    `\n${toUpdate.length} class(es) need a session-count update; ${
      rows.length - toUpdate.length
    } already correct.`
  );

  if (!isExecute) {
    console.log('\nDry-run only. Re-run with --execute to write.');
    return;
  }

  let written = 0;
  for (const r of toUpdate) {
    try {
      await webflow.collections.items.updateItem(collectionId, r.webflowItemId, {
        // Same draft rule as ClassService: dev items stay drafts so a
        // full-site publish never puts them on the shared live site.
        isArchived: false,
        isDraft: !isProd,
        fieldData: { 'session-count': r.desired },
      });
      if (isProd) {
        await webflow.collections.items.publishItem(collectionId, {
          itemIds: [r.webflowItemId],
        });
      }
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
    `\nUpdated ${written} Webflow item(s)${isProd ? ' and published them' : ' (dev: left as drafts)'}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
