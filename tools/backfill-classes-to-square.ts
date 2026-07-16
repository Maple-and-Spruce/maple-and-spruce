/**
 * One-time backfill: push existing published classes into Square as catalog
 * items so they appear in the POS item library and can be rung up in person.
 *
 * WHY THIS IS NEEDED: `syncClassToSquare` is an onDocumentWritten trigger, so
 * it only fires when a class doc is written with a change to a sync-relevant
 * field (name/description/priceCents/capacity/status). Classes that already
 * existed when the function deployed have never fired it, so they have no
 * Square catalog item. A plain re-save does NOT help — the trigger's change
 * guard skips writes that don't touch a relevant field. This script performs
 * the trigger's *create* path directly for each published class that isn't
 * mirrored yet.
 *
 * It reproduces exactly what `syncClassToSquare` does on a published-create:
 *   1. batchUpsert a Square ITEM + ITEM_VARIATION + a required single-option
 *      MODIFIER_LIST ("Added customer email (required)?").
 *   2. Write the returned Square IDs back onto the class doc WITHOUT bumping
 *      `updatedAt` (same feedback-loop guard the repo helpers use).
 *   3. Seed inventory to (capacity - registrationCount) via PHYSICAL_COUNT.
 *
 * Idempotent: classes that already carry `squareCatalogItemId` are skipped, so
 * it's safe to re-run. Dry-run by default — pass --execute to write.
 *
 * Usage:
 *   export SQUARE_ACCESS_TOKEN=EAAA...        # sandbox token
 *   npx tsx tools/backfill-classes-to-square.ts                     # dry-run, dev
 *   npx tsx tools/backfill-classes-to-square.ts --execute           # write, dev
 *
 *   export SQUARE_ACCESS_TOKEN=EAAA...        # PRODUCTION token
 *   export SQUARE_LOCATION_ID=L...            # optional; else first location
 *   npx tsx tools/backfill-classes-to-square.ts --prod              # dry-run, prod
 *   npx tsx tools/backfill-classes-to-square.ts --prod --execute    # write, prod
 *
 * Firestore auth uses application-default credentials (gcloud auth), matching
 * the other tools in this directory.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { SquareClient, SquareEnvironment } from 'square';

const isProd = process.argv.includes('--prod');
const execute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const accessToken = process.env['SQUARE_ACCESS_TOKEN'];
if (!accessToken) {
  console.error('SQUARE_ACCESS_TOKEN env var is required.');
  process.exit(1);
}

const app = initializeApp({ projectId });
const db = getFirestore(app);
const square = new SquareClient({
  token: accessToken,
  environment: isProd ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});

console.log(
  `\n=== Backfill published classes → Square catalog on ${projectId} ` +
    `(${execute ? 'EXECUTE' : 'DRY-RUN'}) ===\n`
);

interface ClassLite {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  capacity: number;
  squareCatalogItemId?: string;
}

/** Sum quantity across pending+confirmed registrations for a class. */
async function registrationCount(classId: string): Promise<number> {
  // Single-field equality (no composite index needed); status filtered in JS.
  const snap = await db
    .collection('registrations')
    .where('classId', '==', classId)
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d['status'] === 'pending' || d['status'] === 'confirmed') {
      count += typeof d['quantity'] === 'number' ? d['quantity'] : 1;
    }
  }
  return count;
}

async function resolveLocationId(): Promise<string> {
  const fromEnv = process.env['SQUARE_LOCATION_ID'];
  if (fromEnv) return fromEnv;
  const page = await square.locations.list();
  const locs =
    (page as { locations?: { id?: string; name?: string }[] }).locations ?? [];
  const id = locs[0]?.id;
  if (!id) throw new Error('No Square location found and SQUARE_LOCATION_ID unset');
  console.log(`Using Square location ${id} (${locs[0]?.name ?? 'unknown'})\n`);
  return id;
}

async function createClassCatalogItem(cls: ClassLite): Promise<{
  squareItemId: string;
  squareVariationId: string;
  squareModifierListId: string;
  squareCatalogVersion: number;
}> {
  const itemTempId = `#class-item-${cls.id}`;
  const variationTempId = `#class-variation-${cls.id}`;
  const modifierListTempId = `#class-modlist-${cls.id}`;
  const modifierTempId = `#class-mod-yes-${cls.id}`;

  const response = await square.catalog.batchUpsert({
    idempotencyKey: `class-backfill-${cls.id}-${Date.now()}`,
    batches: [
      {
        objects: [
          {
            type: 'MODIFIER_LIST',
            id: modifierListTempId,
            modifierListData: {
              name: 'Added customer email (required)?',
              selectionType: 'SINGLE',
              modifiers: [
                {
                  type: 'MODIFIER',
                  id: modifierTempId,
                  modifierData: {
                    name: 'Yes',
                    priceMoney: { amount: 0n, currency: 'USD' },
                  },
                },
              ],
            },
          },
          {
            type: 'ITEM',
            id: itemTempId,
            itemData: {
              name: cls.name,
              description: cls.description,
              modifierListInfo: [
                {
                  modifierListId: modifierListTempId,
                  enabled: true,
                  minSelectedModifiers: 1,
                  maxSelectedModifiers: 1,
                },
              ],
              variations: [
                {
                  type: 'ITEM_VARIATION',
                  id: variationTempId,
                  itemVariationData: {
                    name: 'Registration',
                    pricingType: 'FIXED_PRICING',
                    priceMoney: {
                      amount: BigInt(cls.priceCents),
                      currency: 'USD',
                    },
                    trackInventory: true,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  if (response.errors && response.errors.length > 0) {
    throw new Error(
      `Square API error: ${response.errors
        .map((e) => e.detail || e.code || 'Unknown error')
        .join(', ')}`
    );
  }

  const objects = response.objects ?? [];
  const item = objects.find((o) => o.type === 'ITEM');
  const modList = objects.find((o) => o.type === 'MODIFIER_LIST');
  const variation = item?.itemData?.variations?.[0];
  if (!item?.id || !modList?.id || !variation?.id) {
    throw new Error(
      `Backfill create for ${cls.id} returned incomplete objects: ` +
        JSON.stringify(response.objects)
    );
  }

  return {
    squareItemId: item.id,
    squareVariationId: variation.id,
    squareModifierListId: modList.id,
    squareCatalogVersion: Number(item.version || 0),
  };
}

async function seedInventory(
  variationId: string,
  locationId: string,
  quantity: number
): Promise<void> {
  await square.inventory.batchCreateChanges({
    idempotencyKey: `backfill-set-${variationId}-${Date.now()}`,
    changes: [
      {
        type: 'PHYSICAL_COUNT',
        physicalCount: {
          catalogObjectId: variationId,
          locationId,
          quantity: String(quantity),
          state: 'IN_STOCK',
          occurredAt: new Date().toISOString(),
        },
      },
    ],
  });
}

(async () => {
  const locationId = await resolveLocationId();

  const snap = await db
    .collection('classes')
    .where('status', '==', 'published')
    .get();

  const classes: ClassLite[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data['name'],
      description: data['description'],
      priceCents: data['priceCents'],
      capacity: data['capacity'],
      squareCatalogItemId: data['squareCatalogItemId'],
    };
  });

  const already = classes.filter((c) => c.squareCatalogItemId);
  const todo = classes.filter((c) => !c.squareCatalogItemId);

  console.log(
    `Found ${classes.length} published classes: ` +
      `${already.length} already in Square, ${todo.length} to backfill.\n`
  );

  let created = 0;
  let failed = 0;
  for (const cls of todo) {
    const count = await registrationCount(cls.id);
    const remaining = Math.max(cls.capacity - count, 0);
    const label =
      `${cls.name} (${cls.id}) — $${(cls.priceCents / 100).toFixed(2)}, ` +
      `capacity ${cls.capacity} − ${count} registered = ${remaining} seats`;

    if (!execute) {
      console.log(`  [dry-run] would create: ${label}`);
      continue;
    }

    try {
      const ids = await createClassCatalogItem(cls);
      // Bare update, no updatedAt — mirrors ClassRepository.updateSquareSyncIds
      // so we don't re-trigger syncClassToSquare.
      await db.collection('classes').doc(cls.id).update({
        squareCatalogItemId: ids.squareItemId,
        squareVariationId: ids.squareVariationId,
        squareModifierListId: ids.squareModifierListId,
        squareCatalogVersion: ids.squareCatalogVersion,
      });
      if (remaining > 0) {
        await seedInventory(ids.squareVariationId, locationId, remaining);
      }
      created++;
      console.log(`  ✓ created: ${label} → item ${ids.squareItemId}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ FAILED: ${label}\n      ${msg}`);
    }
  }

  console.log(
    `\nDone. ${execute ? `created ${created}, failed ${failed}` : `${todo.length} pending (dry-run)`}` +
      `, ${already.length} skipped (already synced).`
  );
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
