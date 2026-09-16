/**
 * Find and remove duplicate Webflow CMS items for a single class.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ClassService.syncClass` decides create-vs-update with an unguarded
 * read-then-write: `resolveExistingItemId()` looks for an item, and if it
 * finds none it calls `createItem()`. Nothing serializes that, Webflow
 * enforces no uniqueness on `firebase-id`, and `syncClassToWebflow` has no
 * relevant-fields guard — so a single admin save can fire the trigger twice
 * (the `syncClassToSquare` id write-back re-fires it) and both invocations
 * take the create branch. The observed duplicates were created 35ms-974ms
 * apart, which is that race.
 *
 * The loser of the write-back then has no Firestore record pointing at it, so
 * it is never updated again and its `spots-remaining` freezes at the value it
 * had when it was created. Two cards for one class, disagreeing about
 * availability.
 *
 * WHAT THIS DOES
 * --------------
 * Groups every CMS item by `firebase-id`, picks the ONE item Firestore points
 * at as the keeper, and removes the rest. It also reports (but never deletes
 * on its own judgement) two adjacent integrity problems it finds on the way:
 * live items whose class no longer exists in Firestore, and registrations
 * whose class was hard-deleted.
 *
 * Registrations are NOT at risk and nothing needs merging: `Registration` has
 * no Webflow reference at all — it keys on `classId`, and every item in a
 * duplicate group carries the SAME `firebase-id` (= that classId). Both cards
 * always pointed at one class. The script asserts this rather than assuming
 * it, and refuses to delete anything if the assertion fails.
 *
 * Removal is two calls, not one. `deleteItemLive` unpublishes and sets
 * `isDraft = true`; it does not remove the item (see `ClassService.
 * unpublishItems`). Deleting only-live leaves a staged ghost that the next
 * full-site publish can resurrect; deleting only-staged leaves the card live.
 * So a live loser gets both, in that order.
 *
 * Credentials:
 *   - Firebase: Application Default Credentials
 *       (gcloud auth application-default login)
 *   - Webflow: WEBFLOW_API_TOKEN + WEBFLOW_CLASSES_COLLECTION_ID env vars.
 *     Use the PROD values when running with --prod.
 *
 * Usage:
 *   export WEBFLOW_API_TOKEN=...
 *   export WEBFLOW_CLASSES_COLLECTION_ID=...
 *   npx tsx tools/dedupe-class-cms-items.ts --prod            # dry-run
 *   npx tsx tools/dedupe-class-cms-items.ts --prod --execute  # delete losers
 */

import { writeFileSync } from 'node:fs';
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

const app = initializeApp({ projectId });
const db = getFirestore(app);
const webflow = new WebflowClient({ accessToken });

/** Mirrors RegistrationRepository.countByClassId. */
const COUNTED_STATUSES = ['pending', 'confirmed'];

interface CmsItem {
  id: string;
  firebaseId: string;
  name: string;
  slug: string;
  spotsRemaining: number | undefined;
  spotsDisplay: string | undefined;
  isDev: boolean;
  isDraft: boolean;
  lastPublished: string | null;
  lastUpdated: string | null;
  createdOn: string | null;
  /** The untouched API response, written to the backup file before deletion. */
  raw: unknown;
}

interface ClassRow {
  id: string;
  name: string;
  status: string | undefined;
  capacity: number | undefined;
  webflowItemId: string | undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

async function listAllItems(): Promise<CmsItem[]> {
  const PAGE_SIZE = 100;
  const out: CmsItem[] = [];
  let offset = 0;

  // Same 5000 bound as ClassService.findByFirebaseId.
  while (offset < 5000) {
    const response = await webflow.collections.items.listItems(collectionId!, {
      limit: PAGE_SIZE,
      offset,
    });
    const items = response.items ?? [];
    for (const item of items) {
      const f = (item.fieldData ?? {}) as Record<string, unknown>;
      const firebaseId = str(f['firebase-id']);
      if (!item.id || !firebaseId) continue;
      out.push({
        id: item.id,
        firebaseId,
        name: str(f['name']) ?? '(unnamed)',
        slug: str(f['slug']) ?? '(no slug)',
        spotsRemaining:
          typeof f['spots-remaining'] === 'number'
            ? (f['spots-remaining'] as number)
            : undefined,
        spotsDisplay: str(f['spots-display']),
        isDev: f['is-dev-environment'] === true,
        isDraft: item.isDraft === true,
        lastPublished: item.lastPublished ?? null,
        lastUpdated: item.lastUpdated ?? null,
        createdOn: item.createdOn ?? null,
        raw: item,
      });
    }
    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

async function loadClasses(): Promise<Map<string, ClassRow>> {
  const snap = await db.collection('classes').get();
  const map = new Map<string, ClassRow>();
  for (const doc of snap.docs) {
    const d = doc.data();
    map.set(doc.id, {
      id: doc.id,
      name: (d['name'] as string) ?? '(unnamed)',
      status: d['status'] as string | undefined,
      capacity: d['capacity'] as number | undefined,
      webflowItemId: d['webflowItemId'] as string | undefined,
    });
  }
  return map;
}

/** classId -> counted spots (pending + confirmed, summed by quantity). */
async function loadRegistrationCounts(): Promise<Map<string, number>> {
  const snap = await db.collection('registrations').get();
  const counts = new Map<string, number>();
  for (const doc of snap.docs) {
    const d = doc.data();
    const classId = d['classId'] as string | undefined;
    if (!classId) continue;
    if (!COUNTED_STATUSES.includes(String(d['status']))) continue;
    counts.set(classId, (counts.get(classId) ?? 0) + ((d['quantity'] as number) || 1));
  }
  return counts;
}

/** Every classId referenced by a registration, whatever its status. */
async function loadAllReferencedClassIds(): Promise<Map<string, number>> {
  const snap = await db.collection('registrations').get();
  const refs = new Map<string, number>();
  for (const doc of snap.docs) {
    const classId = doc.data()['classId'] as string | undefined;
    if (classId) refs.set(classId, (refs.get(classId) ?? 0) + 1);
  }
  return refs;
}

function describe(item: CmsItem, role: string): string {
  const state = item.isDraft ? 'DRAFT' : 'LIVE';
  return (
    `    ${role.padEnd(6)} ${item.slug}\n` +
    `           id=${item.id} ${state} spots=${item.spotsRemaining ?? '?'} ` +
    `(${item.spotsDisplay ?? 'no display'}) created=${item.createdOn ?? '?'} updated=${
      item.lastUpdated ?? '?'
    }`
  );
}

async function main(): Promise<void> {
  console.log(
    `Dedupe Webflow class CMS items on ${projectId} (${
      isExecute ? 'EXECUTE' : 'DRY-RUN'
    })\n`
  );

  const [allItems, classes, regCounts, regRefs] = await Promise.all([
    listAllItems(),
    loadClasses(),
    loadRegistrationCounts(),
    loadAllReferencedClassIds(),
  ]);

  // A dev-synced item's firebase-id belongs to the OTHER Firebase project, so
  // it would look like an orphan here. Only ever consider items belonging to
  // the environment we are pointed at.
  const items = allItems.filter((i) => i.isDev === !isProd);
  console.log(
    `${allItems.length} CMS items total; ${items.length} belong to this environment ` +
      `(is-dev-environment=${!isProd}); ${classes.size} Firestore classes.\n`
  );

  const byFirebaseId = new Map<string, CmsItem[]>();
  for (const item of items) {
    byFirebaseId.set(item.firebaseId, [...(byFirebaseId.get(item.firebaseId) ?? []), item]);
  }

  const toUnpublishThenDelete: CmsItem[] = [];
  const toDelete: CmsItem[] = [];
  let blocked = 0;

  console.log('===== DUPLICATE GROUPS =====\n');
  const groups = [...byFirebaseId.entries()].filter(([, v]) => v.length > 1);
  if (groups.length === 0) console.log('  (none)\n');

  for (const [firebaseId, group] of groups) {
    const cls = classes.get(firebaseId);
    const counted = regCounts.get(firebaseId) ?? 0;
    const trueSpots =
      cls?.capacity !== undefined ? cls.capacity - counted : undefined;

    console.log(`  ${firebaseId}  ${group[0].name}  (${group.length} items)`);

    if (!cls) {
      // No class document. Every item here advertises a class that does not
      // exist — registering against it cannot succeed.
      console.log(
        `    !! NO FIRESTORE CLASS DOC. All ${group.length} item(s) are stale.` +
          (group.some((i) => !i.isDraft) ? ' ONE OR MORE IS LIVE.' : '')
      );
      for (const item of group) {
        console.log(describe(item, 'REMOVE'));
        (item.isDraft ? toDelete : toUnpublishThenDelete).push(item);
      }
      console.log('');
      continue;
    }

    console.log(
      `    class: status=${cls.status} capacity=${cls.capacity} ` +
        `registrations(counted)=${counted} TRUE spots-remaining=${trueSpots}`
    );

    const keeper =
      group.find((i) => i.id === cls.webflowItemId) ??
      // Firestore's pointer is dangling; fall back to the most recently
      // touched item, which is the one the sync has been maintaining.
      [...group].sort((a, b) =>
        String(b.lastUpdated).localeCompare(String(a.lastUpdated))
      )[0];

    if (keeper.id !== cls.webflowItemId) {
      console.log(
        `    !! Firestore webflowItemId=${cls.webflowItemId ?? '(none)'} matches no item ` +
          `in this group; falling back to most-recently-updated.`
      );
    }

    for (const item of group) {
      if (item.id === keeper.id) {
        console.log(describe(item, 'KEEP'));
        if (trueSpots !== undefined && item.spotsRemaining !== trueSpots) {
          console.log(
            `           ^ DRIFT: shows ${item.spotsRemaining}, truth is ${trueSpots}. ` +
              `Re-save the class in admin to resync (this script does not write field data).`
          );
        }
      } else {
        console.log(describe(item, 'REMOVE'));
        (item.isDraft ? toDelete : toUnpublishThenDelete).push(item);
      }
    }
    console.log('');
  }

  // Singletons whose class is gone are the same customer-facing bug as a
  // duplicate — a card selling a class that does not exist — so surface them,
  // but do not delete on this script's own judgement.
  console.log('===== LIVE ITEMS WITH NO FIRESTORE CLASS (not duplicates) =====');
  const strays = items.filter(
    (i) => !i.isDraft && !classes.has(i.firebaseId) && (byFirebaseId.get(i.firebaseId)?.length ?? 0) === 1
  );
  if (strays.length === 0) console.log('  (none)');
  for (const i of strays) {
    console.log(`  ${i.slug}  id=${i.id} firebase-id=${i.firebaseId} spots=${i.spotsRemaining ?? '?'}`);
  }

  console.log('\n===== REGISTRATIONS POINTING AT A DELETED CLASS =====');
  const orphanRefs = [...regRefs.entries()].filter(([classId]) => !classes.has(classId));
  if (orphanRefs.length === 0) console.log('  (none)');
  for (const [classId, n] of orphanRefs) {
    console.log(`  classId=${classId}  ${n} registration(s)  -- class document is gone`);
  }

  // Safety assertion: every item queued for removal must share its firebase-id
  // with an item we are keeping, or belong to a class that no longer exists.
  // If that ever fails we would be deleting the only card for a live class.
  for (const item of [...toDelete, ...toUnpublishThenDelete]) {
    const group = byFirebaseId.get(item.firebaseId) ?? [];
    const keepsOne = group.some((g) => !toDelete.includes(g) && !toUnpublishThenDelete.includes(g));
    if (!keepsOne && classes.has(item.firebaseId)) {
      console.error(
        `\nABORT: ${item.slug} would leave class ${item.firebaseId} with no CMS item.`
      );
      blocked++;
    }
  }
  if (blocked > 0) process.exit(1);

  console.log(
    `\n===== PLAN =====\n` +
      `  ${toUnpublishThenDelete.length} LIVE item(s): unpublish (deleteItemLive) then delete (deleteItem)\n` +
      `  ${toDelete.length} DRAFT item(s): delete (deleteItem)\n`
  );

  if (!isExecute) {
    console.log('Dry-run only. Re-run with --execute to remove.');
    return;
  }

  // Write every doomed item to disk BEFORE touching anything. Deletion is
  // irreversible and there is no archive collection, so for a group whose
  // Firestore class is already gone the CMS item is the last surviving record
  // of that class. Cheap insurance against a wrong call.
  const doomed = [...toUnpublishThenDelete, ...toDelete];
  const backupPath = `dedupe-class-cms-items-backup-${Date.now()}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        project: projectId,
        removedAt: new Date().toISOString(),
        items: doomed.map((i) => i.raw),
      },
      null,
      2
    )
  );
  console.log(`Backed up ${doomed.length} item(s) to ${backupPath}\n`);

  function isNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { statusCode?: number }).statusCode === 404
    );
  }

  let removed = 0;
  for (const item of doomed) {
    try {
      // A live item must be taken off the published site first. Webflow's
      // live-delete endpoint unpublishes (see ClassService.unpublishItems), so
      // the staged delete below is what actually removes it — but if the live
      // call did remove it outright, that staged call 404s. That 404 means
      // "already gone", not a failure, so it must not be reported as one.
      if (!item.isDraft) {
        await webflow.collections.items.deleteItemLive(collectionId!, item.id);
      }
      try {
        await webflow.collections.items.deleteItem(collectionId!, item.id);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      console.log(
        `  removed ${item.isDraft ? '(draft)' : '(was live)'} ${item.slug}`
      );
      removed++;
    } catch (error) {
      console.warn(
        `  ! failed to remove ${item.slug} (${item.id}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Prove it rather than trusting the status codes: every removed item must
  // now be absent, and every class must still have exactly one item.
  console.log('\nVerifying...');
  const after = (await listAllItems()).filter((i) => i.isDev === !isProd);
  const survivors = doomed.filter((d) => after.some((a) => a.id === d.id));
  if (survivors.length > 0) {
    console.warn(
      `  ! ${survivors.length} item(s) still present: ${survivors
        .map((s) => s.slug)
        .join(', ')}`
    );
  }
  const stillDuplicated = [
    ...after.reduce((map, item) => {
      map.set(item.firebaseId, (map.get(item.firebaseId) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ].filter(([, count]) => count > 1);

  console.log(
    `  ${removed} removed, ${survivors.length} survivor(s), ` +
      `${stillDuplicated.length} firebase-id(s) still holding more than one item.`
  );
  if (stillDuplicated.length === 0 && survivors.length === 0) {
    console.log('  One class, one CMS item. Clean.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Dedupe failed:', error);
    process.exit(1);
  });
