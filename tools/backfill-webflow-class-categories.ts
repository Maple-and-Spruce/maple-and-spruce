/**
 * One-time backfill for the Webflow Class Categories collection and the
 * `category` Reference field on class items (#776).
 *
 * The related-classes list on the class template page is a native Webflow
 * Collection List filtered to "Category = Current Class's Category". That
 * filter only works against a Reference field, so every live class item needs
 * its `category` reference populated — and the category it points at needs to
 * exist in the Class Categories collection first.
 *
 * Going forward `syncClassCategoryToWebflow` keeps the collection current, and
 * `syncClassToWebflow` links each class (creating the category on demand if
 * needed). This script covers the classes and categories that already exist
 * and would otherwise sit unlinked until someone happened to edit them.
 *
 * Two passes:
 *   1. Every `classCategories` doc without a `webflowItemId` is created in the
 *      Class Categories collection (or matched to an existing item by
 *      `firebase-id`), published, and the ID written back to Firestore.
 *   2. Every synced class is PATCHed with its category's item ID (when not
 *      already linked) and with `is-full`, then republished. `is-full` is what
 *      the related-classes block binds its visibility to, and it only lands on
 *      an item when that class next syncs.
 *
 * Credentials:
 *   - Firebase: Application Default Credentials
 *       (gcloud auth application-default login)
 *   - Webflow: WEBFLOW_API_TOKEN + WEBFLOW_CLASSES_COLLECTION_ID +
 *     WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID env vars. Values live in the
 *     Functions env / Secret Manager for each project.
 *
 * Usage:
 *   export WEBFLOW_API_TOKEN=...
 *   export WEBFLOW_CLASSES_COLLECTION_ID=...
 *   export WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID=...
 *   npx tsx tools/backfill-webflow-class-categories.ts                   # dry-run, dev
 *   npx tsx tools/backfill-webflow-class-categories.ts --prod            # dry-run, prod
 *   npx tsx tools/backfill-webflow-class-categories.ts --execute         # write, dev
 *   npx tsx tools/backfill-webflow-class-categories.ts --prod --execute  # write, prod
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { WebflowClient } from 'webflow-api';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const accessToken = process.env['WEBFLOW_API_TOKEN'];
const classesCollectionId = process.env['WEBFLOW_CLASSES_COLLECTION_ID'];
const categoriesCollectionId =
  process.env['WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID'];

if (!accessToken || !classesCollectionId || !categoriesCollectionId) {
  console.error(
    'WEBFLOW_API_TOKEN, WEBFLOW_CLASSES_COLLECTION_ID and ' +
      'WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID env vars are required.\n' +
      'Grab the values for the target project from its Functions env / Secret Manager.'
  );
  process.exit(1);
}

console.log(
  `Backfill Webflow class categories on ${projectId} (${
    isExecute ? 'EXECUTE' : 'DRY-RUN'
  })`
);

const app = initializeApp({ projectId });
const db = getFirestore(app);
const webflow = new WebflowClient({ accessToken });

// Dev-synced items stay drafts so a full-site publish can't make them live;
// prod items are published. Mirrors every other Webflow sync in this repo.
const isDev = !isProd;

/**
 * Slug generation matching `generateSlug` in artist.service.ts.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Read every item in a collection, keyed by its `firebase-id`. Webflow has no
 * field filters, so this is a full paginated scan — cheaper done once here
 * than per-item inside the loops below.
 */
async function itemsByFirebaseId(
  collectionId: string
): Promise<Map<string, { id: string; fieldData: Record<string, unknown> }>> {
  const PAGE_SIZE = 100;
  const byFirebaseId = new Map<
    string,
    { id: string; fieldData: Record<string, unknown> }
  >();
  let offset = 0;

  for (;;) {
    const response = await webflow.collections.items.listItems(collectionId, {
      limit: PAGE_SIZE,
      offset,
    });
    const items = response.items ?? [];

    for (const item of items) {
      const fieldData = (item.fieldData ?? {}) as Record<string, unknown>;
      const firebaseId = fieldData['firebase-id'];
      if (item.id && typeof firebaseId === 'string') {
        byFirebaseId.set(firebaseId, { id: item.id, fieldData });
      }
    }

    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return byFirebaseId;
}

/**
 * Pass 1 — make sure every Firestore class category has a Webflow item, and
 * that its ID is recorded on the Firestore doc.
 *
 * @returns categoryId -> Webflow item ID, for every category we could resolve
 */
async function backfillCategories(): Promise<Map<string, string>> {
  const snap = await db.collection('classCategories').get();
  const liveItems = await itemsByFirebaseId(categoriesCollectionId!);

  const resolved = new Map<string, string>();
  const toCreate: { id: string; name: string; data: Record<string, unknown> }[] =
    [];
  const toRecord: { id: string; name: string; itemId: string }[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = (data['name'] as string) ?? '(unnamed)';
    const storedItemId = data['webflowItemId'];
    const liveItem = liveItems.get(doc.id);

    if (typeof storedItemId === 'string' && storedItemId) {
      resolved.set(doc.id, storedItemId);
      continue;
    }

    if (liveItem) {
      // Item exists in Webflow but Firestore lost track of the ID — record it
      // rather than creating a duplicate.
      resolved.set(doc.id, liveItem.id);
      toRecord.push({ id: doc.id, name, itemId: liveItem.id });
      continue;
    }

    toCreate.push({ id: doc.id, name, data });
  }

  console.log(
    `\nCategories: ${snap.size} in Firestore, ${resolved.size} already linked, ` +
      `${toRecord.length} to re-record, ${toCreate.length} to create.`
  );
  for (const c of toCreate) console.log(`  create: ${c.name}`);
  for (const c of toRecord) console.log(`  re-record: ${c.name} -> ${c.itemId}`);

  if (!isExecute) return resolved;

  for (const c of toRecord) {
    await db
      .collection('classCategories')
      .doc(c.id)
      .update({ webflowItemId: c.itemId });
  }

  for (const c of toCreate) {
    try {
      // Built as one literal so `name` / `slug` stay statically present —
      // the SDK's create type requires both.
      const fieldData = {
        'firebase-id': c.id,
        name: c.name,
        slug: generateSlug(c.name),
        'is-dev-environment': isDev,
        order: (c.data['order'] as number) ?? 0,
        ...(c.data['description']
          ? { description: c.data['description'] }
          : {}),
        ...(c.data['icon'] ? { icon: c.data['icon'] } : {}),
      };

      const created = await webflow.collections.items.createItem(
        categoriesCollectionId!,
        { isArchived: false, isDraft: isDev, fieldData }
      );

      if (!created.id) {
        console.warn(`  ! create returned no ID for ${c.name}`);
        continue;
      }

      if (!isDev) {
        await webflow.collections.items.publishItem(categoriesCollectionId!, {
          itemIds: [created.id],
        });
      }

      await db
        .collection('classCategories')
        .doc(c.id)
        .update({ webflowItemId: created.id });

      resolved.set(c.id, created.id);
    } catch (error) {
      console.warn(
        `  ! create failed for ${c.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return resolved;
}

/**
 * Pass 2 — point every synced class item at its category and set `is-full`.
 *
 * `is-full` is what the related-classes block on the class template page binds
 * its visibility to, and it only lands on an item when that class next syncs.
 * A class that filled up before this shipped would otherwise never show the
 * section, so it is backfilled here from the live spots count.
 */
async function backfillClassReferences(
  categoryItemIds: Map<string, string>
): Promise<void> {
  const snap = await db.collection('classes').get();
  const liveItems = await itemsByFirebaseId(classesCollectionId!);

  const toUpdate: {
    name: string;
    itemId: string;
    fieldData: Record<string, unknown>;
  }[] = [];
  let missingCategory = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = (data['name'] as string) ?? '(unnamed)';

    const live = liveItems.get(doc.id);
    if (!live) continue; // never synced, or unpublished past class

    const fieldData: Record<string, unknown> = {};

    // Derive is-full from what Webflow already believes about spots, so this
    // stays consistent with the spots-display the visitor sees on the card.
    const spotsRemaining = live.fieldData['spots-remaining'];
    if (typeof spotsRemaining === 'number') {
      const isFull = spotsRemaining <= 0;
      if (live.fieldData['is-full'] !== isFull) {
        fieldData['is-full'] = isFull;
      }
    }

    const categoryId = data['categoryId'];
    const alreadyLinked =
      typeof live.fieldData['category'] === 'string' &&
      !!live.fieldData['category'];

    if (typeof categoryId === 'string' && categoryId && !alreadyLinked) {
      const categoryItemId = categoryItemIds.get(categoryId);
      if (categoryItemId) {
        fieldData['category'] = categoryItemId;
      } else {
        missingCategory++;
        console.warn(
          `  ! ${name}: category ${categoryId} has no Webflow item; skipping the link`
        );
      }
    }

    if (Object.keys(fieldData).length > 0) {
      toUpdate.push({ name, itemId: live.id, fieldData });
    }
  }

  console.log(
    `\nClasses: ${liveItems.size} live in Webflow, ${toUpdate.length} need an ` +
      `update, ${missingCategory} blocked on a missing category.`
  );
  for (const c of toUpdate) {
    console.log(`  update: ${c.name} -> ${JSON.stringify(c.fieldData)}`);
  }

  if (!isExecute) return;

  let written = 0;
  for (const c of toUpdate) {
    try {
      await webflow.collections.items.updateItem(
        classesCollectionId!,
        c.itemId,
        {
          isArchived: false,
          isDraft: isDev,
          fieldData: c.fieldData,
        }
      );
      if (!isDev) {
        await webflow.collections.items.publishItem(classesCollectionId!, {
          itemIds: [c.itemId],
        });
      }
      written++;
    } catch (error) {
      console.warn(
        `  ! update/publish failed for ${c.name} (${c.itemId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  console.log(`\nUpdated ${written} class item(s).`);
}

async function main(): Promise<void> {
  const categoryItemIds = await backfillCategories();
  await backfillClassReferences(categoryItemIds);

  if (!isExecute) {
    console.log('\nDry-run only. Re-run with --execute to write.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
