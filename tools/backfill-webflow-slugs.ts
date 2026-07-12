/**
 * One-time backfill for `Class.webflowSlug`.
 *
 * Historically the class → Webflow sync discarded the Webflow API response
 * except for the item ID, so the real slug (which Webflow auto-suffixes on
 * collision, e.g. `stained-glass-tryit-class-b192d`) was never stored. Every
 * public `/classes/{slug}` link — the waitlist "spot opened" email, the Meta/
 * Google catalog feed, the registration widget — regenerated the slug from the
 * class name and therefore 404'd for any class whose Webflow slug differs.
 *
 * The sync now captures `fieldData.slug` going forward. This script populates
 * the field for classes that were already synced before that change, by
 * fetching each class's live Webflow item and reading its real slug.
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
 *   npx tsx tools/backfill-webflow-slugs.ts                   # dry-run, dev
 *   npx tsx tools/backfill-webflow-slugs.ts --prod            # dry-run, prod
 *   npx tsx tools/backfill-webflow-slugs.ts --execute         # write, dev
 *   npx tsx tools/backfill-webflow-slugs.ts --prod --execute  # write, prod
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { WebflowClient } from 'webflow-api';

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
  `Backfill Class.webflowSlug on ${projectId} (${
    isExecute ? 'EXECUTE' : 'DRY-RUN'
  })`
);

const app = initializeApp({ projectId });
const db = getFirestore(app);
const webflow = new WebflowClient({ accessToken });

interface Row {
  id: string;
  name: string;
  webflowItemId: string;
  storedSlug: string | undefined;
  liveSlug: string | undefined;
}

async function fetchLiveSlug(itemId: string): Promise<string | undefined> {
  try {
    const item = await webflow.collections.items.getItem(collectionId!, itemId);
    const fieldData = item?.fieldData as { slug?: unknown } | undefined;
    return typeof fieldData?.slug === 'string' ? fieldData.slug : undefined;
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

  console.log(
    `${snap.size} classes total; ${candidates.length} have a webflowItemId.`
  );

  const rows: Row[] = [];
  for (const c of candidates) {
    const webflowItemId = c.data['webflowItemId'] as string;
    const liveSlug = await fetchLiveSlug(webflowItemId);
    rows.push({
      id: c.id,
      name: (c.data['name'] as string) ?? '(unnamed)',
      webflowItemId,
      storedSlug: c.data['webflowSlug'] as string | undefined,
      liveSlug,
    });
  }

  // Only rows where we resolved a live slug that differs from what's stored.
  const toUpdate = rows.filter(
    (r) => r.liveSlug && r.liveSlug !== r.storedSlug
  );
  const unresolved = rows.filter((r) => !r.liveSlug);

  console.log('');
  for (const r of toUpdate) {
    console.log(
      `  ${r.name}\n    ${r.storedSlug ?? '(none)'} -> ${r.liveSlug}`
    );
  }
  if (unresolved.length > 0) {
    console.log(
      `\n${unresolved.length} class(es) had no resolvable Webflow slug (deleted item or API error):`
    );
    for (const r of unresolved) console.log(`  - ${r.name} (${r.id})`);
  }

  console.log(
    `\n${toUpdate.length} class(es) need a slug update; ${
      rows.length - toUpdate.length - unresolved.length
    } already correct.`
  );

  if (!isExecute) {
    console.log('\nDry-run only. Re-run with --execute to write.');
    return;
  }

  let written = 0;
  for (const r of toUpdate) {
    // Bare update (no updatedAt) so it does not re-trigger the Webflow sync.
    await db.collection('classes').doc(r.id).update({ webflowSlug: r.liveSlug });
    written++;
  }
  console.log(`\nUpdated ${written} class document(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
