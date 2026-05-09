/**
 * One-time cleanup for the Square catalog items abandoned by the
 * dedupe-etsy-imported-products tool. Each duplicate Firestore Product
 * pointed at its own Square catalog item; the dedupe deletes the
 * Firestore docs but Square is still littered with the orphaned items,
 * which would clutter the in-store register and any catalog feeds.
 *
 * Strategy:
 *   - Pull every Square ITEM via catalog.list (paginated).
 *   - Pull every Firestore Product's squareItemId.
 *   - Square IDs not referenced by any live Product = orphans.
 *   - Dry-run prints the list. --execute batch-deletes them via
 *     catalog.batchDelete (200 per call, the API limit).
 *
 * Square IDs are case-sensitive and look like "DFGJUG7SO3XSZX754ATO3DYP".
 *
 * Credentials:
 *   - Firebase: Application Default Credentials (gcloud auth application-default login)
 *   - Square: SQUARE_ACCESS_TOKEN env var. Use a production token when
 *     running with --prod, sandbox when running in dev. Tokens live in
 *     Square Developer Dashboard → Applications → Production / Sandbox.
 *
 * Usage:
 *   export SQUARE_ACCESS_TOKEN=EAAA...                            # prod or sandbox
 *   npx tsx tools/delete-orphan-square-items.ts                   # dry-run, dev
 *   npx tsx tools/delete-orphan-square-items.ts --prod            # dry-run, prod
 *   npx tsx tools/delete-orphan-square-items.ts --execute         # delete, dev
 *   npx tsx tools/delete-orphan-square-items.ts --prod --execute  # delete, prod
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { SquareClient, SquareEnvironment } from 'square';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const accessToken = process.env['SQUARE_ACCESS_TOKEN'];
if (!accessToken) {
  console.error(
    'SQUARE_ACCESS_TOKEN env var is required. Grab one from the Square Developer Dashboard.'
  );
  process.exit(1);
}

console.log(
  `Delete orphan Square catalog items on ${projectId} (${
    isExecute ? 'EXECUTE' : 'DRY-RUN'
  })`
);

const app = initializeApp({ projectId });
const db = getFirestore(app);

const square = new SquareClient({
  token: accessToken,
  environment: isProd ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});

interface OrphanItem {
  id: string;
  name: string;
  variationCount: number;
}

async function loadLiveSquareItemIds(): Promise<Set<string>> {
  const snap = await db.collection('products').get();
  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const sqId = data['squareItemId'];
    if (typeof sqId === 'string' && sqId.length > 0) ids.add(sqId);
  }
  return ids;
}

async function listSquareItems(): Promise<OrphanItem[]> {
  const items: OrphanItem[] = [];
  const pager = await square.catalog.list({ types: 'ITEM' });
  for await (const obj of pager) {
    if (obj.type !== 'ITEM') continue;
    const id = obj.id;
    if (!id) continue;
    const itemData = obj.itemData;
    items.push({
      id,
      name: itemData?.name ?? '(no name)',
      variationCount: itemData?.variations?.length ?? 0,
    });
  }
  return items;
}

async function batchDelete(objectIds: string[]): Promise<void> {
  // Square caps batch-delete at 200 IDs per call.
  const CHUNK = 200;
  for (let i = 0; i < objectIds.length; i += CHUNK) {
    const chunk = objectIds.slice(i, i + CHUNK);
    await square.catalog.batchDelete({ objectIds: chunk });
    console.log(
      `  batch-deleted ${Math.min(i + CHUNK, objectIds.length)}/${
        objectIds.length
      }`
    );
  }
}

async function main(): Promise<void> {
  console.log('Loading Firestore products…');
  const liveIds = await loadLiveSquareItemIds();
  console.log(`  ${liveIds.size} live squareItemId references.`);

  console.log('Listing Square catalog (this paginates, can take a minute)…');
  const allItems = await listSquareItems();
  console.log(`  ${allItems.length} total catalog items in Square.`);

  const orphans = allItems.filter((it) => !liveIds.has(it.id));
  console.log('');
  console.log(
    `Orphan Square items (in Square but not referenced by any live Product): ${orphans.length}`
  );

  if (orphans.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Show a preview rather than dumping all 600 lines.
  const PREVIEW = 25;
  for (const o of orphans.slice(0, PREVIEW)) {
    console.log(
      `  ${o.id}  ${o.name}  (${o.variationCount} variations)`
    );
  }
  if (orphans.length > PREVIEW) {
    console.log(`  …and ${orphans.length - PREVIEW} more.`);
  }

  if (!isExecute) {
    console.log('');
    console.log('Dry-run complete. Re-run with --execute to apply.');
    return;
  }

  console.log('');
  console.log('Batch-deleting orphan Square catalog items…');
  await batchDelete(orphans.map((o) => o.id));
  console.log('');
  console.log(`Done. Deleted ${orphans.length} catalog items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
