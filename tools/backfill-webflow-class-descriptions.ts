/**
 * One-time backfill for the Webflow `description` field on the Classes CMS.
 *
 * The class → Webflow sync now sends the description as rich text HTML
 * (`classDescriptionToHtml`): paragraphs, line breaks, bold and italic. Before
 * that it sent the text as typed, so every line break on the class page folded
 * into one paragraph. Existing CMS items only pick the HTML up when their class
 * re-syncs, so this script rewrites the field for every synced class now.
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
 *   npx tsx tools/backfill-webflow-class-descriptions.ts                   # dry-run, dev
 *   npx tsx tools/backfill-webflow-class-descriptions.ts --prod            # dry-run, prod
 *   npx tsx tools/backfill-webflow-class-descriptions.ts --execute         # write, dev
 *   npx tsx tools/backfill-webflow-class-descriptions.ts --prod --execute  # write, prod
 *
 * On --prod --execute each updated item is published; on dev, items are left
 * as drafts (as the sync does), so nothing reaches the shared live site.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { WebflowClient } from 'webflow-api';
import { classDescriptionToHtml } from '@maple/ts/domain';

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
  `Backfill Webflow class descriptions on ${projectId} (${
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
  desired: string;
  live: string | undefined;
  /** True when the Webflow item is an unpublished draft (past or test classes). */
  isDraft: boolean;
}

interface LiveItem {
  description: string | undefined;
  isDraft: boolean;
}

async function fetchLive(itemId: string): Promise<LiveItem> {
  try {
    const item = await webflow.collections.items.getItem(collectionId, itemId);
    const fieldData = item?.fieldData as { description?: unknown } | undefined;
    return {
      description:
        typeof fieldData?.description === 'string'
          ? fieldData.description
          : undefined,
      isDraft: item?.isDraft === true,
    };
  } catch (error) {
    console.warn(
      `  ! getItem failed for ${itemId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    // Unknown state: treat as a draft so it is never republished blindly.
    return { description: undefined, isDraft: true };
  }
}

function countOf(html: string, tag: string): number {
  return html.split(tag).length - 1;
}

async function main(): Promise<void> {
  const snap = await db.collection('classes').get();

  const candidates = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(
      (c) =>
        typeof c.data['webflowItemId'] === 'string' &&
        typeof c.data['description'] === 'string' &&
        c.data['description'].trim() !== ''
    );

  console.log(
    `${snap.size} classes total; ${candidates.length} synced to Webflow with a description.`
  );

  const rows: Row[] = [];
  for (const c of candidates) {
    const webflowItemId = c.data['webflowItemId'] as string;
    const live = await fetchLive(webflowItemId);
    rows.push({
      id: c.id,
      name: (c.data['name'] as string) ?? '(unnamed)',
      webflowItemId,
      desired: classDescriptionToHtml(c.data['description'] as string),
      live: live.description,
      isDraft: live.isDraft,
    });
  }

  // Drafts are unpublished on purpose (past classes, test classes). Updating
  // one would mean flipping it to non-draft and publishing it, which puts the
  // page back on the live site, so leave them alone. They pick the HTML up if
  // they are ever re-synced.
  const skippedDrafts = rows.filter((r) => r.isDraft && r.live !== r.desired);
  const toUpdate = rows.filter((r) => !r.isDraft && r.live !== r.desired);

  console.log('');
  for (const r of toUpdate) {
    console.log(
      `  ${r.name}\n    ${countOf(r.desired, '<p>')} paragraph(s), ${countOf(
        r.desired,
        '<br>'
      )} line break(s), ${countOf(r.desired, '<strong>')} bold, ${countOf(
        r.desired,
        '<em>'
      )} italic`
    );
  }

  console.log(
    `\n${toUpdate.length} published class(es) need a description update; ${
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
      await webflow.collections.items.updateItem(collectionId, r.webflowItemId, {
        // Same draft rule as ClassService: dev items stay drafts so a
        // full-site publish never puts them on the shared live site.
        isArchived: false,
        isDraft: !isProd,
        fieldData: { description: r.desired },
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
