/**
 * One-time cleanup for the duplicate Products created by retried Etsy
 * bulk imports. Each retry that timed out before `etsyListingId` was
 * written produced an orphan Product (same name + SKU as the eventual
 * canonical row, but no etsyListingId, sometimes with a stale
 * artistId). After several retries this can balloon into hundreds of
 * dupes.
 *
 * Strategy:
 *   - Group products by (squareCache.name, first-variant SKU). Etsy
 *     embeds the SKU on each inventory product, so re-imports of the
 *     same listing all share the SKU.
 *   - Score candidates inside each group; keep the best, delete the
 *     rest. Score:
 *       +10  has etsyListingId set
 *       + 5  artistId is in the live artists collection
 *       + 3  status === 'active'
 *       + 1  most recent updatedAt (tiebreaker)
 *   - Defaults to dry-run. Pass --execute to actually delete.
 *
 * Note: this only deletes Firestore Product documents. The orphan
 * Square catalog items each Product points at are reported but NOT
 * deleted — clean those up via the Square dashboard or a follow-up
 * tool. etsy-imports records pointing at deleted Products are left
 * alone (harmless danglers; future imports don't query that
 * collection for dedup).
 *
 * Usage:
 *   npx tsx tools/dedupe-etsy-imported-products.ts             # dry-run, dev
 *   npx tsx tools/dedupe-etsy-imported-products.ts --prod      # dry-run, prod
 *   npx tsx tools/dedupe-etsy-imported-products.ts --execute   # delete, dev
 *   npx tsx tools/dedupe-etsy-imported-products.ts --prod --execute
 */

import { initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentSnapshot,
  type Timestamp,
} from 'firebase-admin/firestore';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

console.log(
  `Dedupe Etsy-imported Products on ${projectId} (${
    isExecute ? 'EXECUTE' : 'DRY-RUN'
  })`
);

const app = initializeApp({ projectId });
const db = getFirestore(app);

// ---------------------------------------------------------------------------
// Types — narrow shapes of the Firestore docs we care about. We don't import
// from the @maple/ts/domain barrel because this is a stand-alone script and
// pulling in the whole domain graph here is overkill.
// ---------------------------------------------------------------------------

interface RawVariant {
  id?: string;
  sku?: string;
  priceCents?: number;
  quantity?: number;
}

interface RawSquareCache {
  name?: string;
  sku?: string;
  priceCents?: number;
  quantity?: number;
}

interface RawProduct {
  id: string;
  artistId?: string;
  status?: string;
  etsyListingId?: string;
  squareItemId?: string;
  squareCache?: RawSquareCache;
  variants?: RawVariant[];
  updatedAt?: Timestamp;
}

function toProduct(doc: DocumentSnapshot): RawProduct {
  const data = doc.data() ?? {};
  return { id: doc.id, ...(data as Omit<RawProduct, 'id'>) };
}

function dedupKey(p: RawProduct): string | null {
  const name = p.squareCache?.name ?? '';
  const sku = p.variants?.[0]?.sku ?? p.squareCache?.sku ?? '';
  if (!name || !sku) return null;
  return `${name}||${sku}`;
}

function score(p: RawProduct, validArtistIds: Set<string>): number {
  let s = 0;
  if (p.etsyListingId) s += 10;
  if (p.artistId && validArtistIds.has(p.artistId)) s += 5;
  if (p.status === 'active') s += 3;
  // updatedAt tiebreaker added at sort time (it's a continuous value, not a
  // discrete bonus, so we lean on it after equal score).
  return s;
}

function updatedAtMs(p: RawProduct): number {
  return p.updatedAt?.toMillis() ?? 0;
}

async function loadValidArtistIds(): Promise<Set<string>> {
  const snap = await db.collection('artists').get();
  return new Set(snap.docs.map((d) => d.id));
}

async function main(): Promise<void> {
  const validArtistIds = await loadValidArtistIds();
  console.log(`Loaded ${validArtistIds.size} live artists.`);

  const productsSnap = await db.collection('products').get();
  const products = productsSnap.docs.map(toProduct);
  console.log(`Loaded ${products.length} products.`);

  // Group by (name, sku); skip products missing either (we won't touch them).
  const groups = new Map<string, RawProduct[]>();
  let unkeyable = 0;
  for (const p of products) {
    const key = dedupKey(p);
    if (!key) {
      unkeyable++;
      continue;
    }
    const existing = groups.get(key);
    if (existing) {
      existing.push(p);
    } else {
      groups.set(key, [p]);
    }
  }
  if (unkeyable > 0) {
    console.log(
      `${unkeyable} product(s) had no name+sku and were skipped (not candidates for dedup).`
    );
  }

  const dupGroups: { key: string; keep: RawProduct; drop: RawProduct[] }[] =
    [];
  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const scoreDiff = score(b, validArtistIds) - score(a, validArtistIds);
      if (scoreDiff !== 0) return scoreDiff;
      return updatedAtMs(b) - updatedAtMs(a);
    });
    dupGroups.push({ key, keep: sorted[0], drop: sorted.slice(1) });
  }

  // Second pass: even after (name, sku) dedup, multiple cluster keepers can
  // share the same etsyListingId — happens when concurrent import rounds
  // both pass findByEtsyListingId before either reaches updateEtsyCache.
  // Re-cluster the linked keepers (plus singletons that have an
  // etsyListingId) by listing ID, promote the best, demote the rest.
  const linkedKeepers: RawProduct[] = [];
  for (const dg of dupGroups) {
    if (dg.keep.etsyListingId) linkedKeepers.push(dg.keep);
  }
  for (const [, group] of groups.entries()) {
    if (group.length !== 1) continue;
    const only = group[0];
    if (only.etsyListingId) linkedKeepers.push(only);
  }

  const byEtsyListingId = new Map<string, RawProduct[]>();
  for (const p of linkedKeepers) {
    const id = p.etsyListingId as string;
    const existing = byEtsyListingId.get(id);
    if (existing) existing.push(p);
    else byEtsyListingId.set(id, [p]);
  }

  const crossClusterDups: {
    listingId: string;
    keep: RawProduct;
    drop: RawProduct[];
  }[] = [];
  for (const [listingId, candidates] of byEtsyListingId.entries()) {
    if (candidates.length < 2) continue;
    const sorted = [...candidates].sort((a, b) => {
      const scoreDiff = score(b, validArtistIds) - score(a, validArtistIds);
      if (scoreDiff !== 0) return scoreDiff;
      return updatedAtMs(b) - updatedAtMs(a);
    });
    const [kept, ...losers] = sorted;
    crossClusterDups.push({ listingId, keep: kept, drop: losers });
  }

  if (dupGroups.length === 0 && crossClusterDups.length === 0) {
    console.log('No duplicate Product groups found. Nothing to do.');
    return;
  }

  // Tag pass-1 keepers that get demoted in pass 2 so the report makes the
  // chain obvious.
  const demotedIds = new Set<string>();
  for (const cc of crossClusterDups) {
    for (const d of cc.drop) demotedIds.add(d.id);
  }

  let totalToDelete = 0;
  const orphanSquareItemIds: string[] = [];
  console.log('');
  console.log('Pass 1 — duplicates within (name, sku) clusters:');
  for (const { key, keep, drop } of dupGroups) {
    const [name] = key.split('||');
    totalToDelete += drop.length;
    const keepBadge = keep.etsyListingId
      ? `linked etsy=${keep.etsyListingId}${
          demotedIds.has(keep.id) ? ' [demoted in pass 2]' : ''
        }`
      : 'NO etsyListingId';
    console.log(
      `\n  ${name} — keeping ${keep.id} (${keep.status ?? '?'}, ${keepBadge})`
    );
    for (const d of drop) {
      const linked = d.etsyListingId ? `etsy=${d.etsyListingId}` : 'orphan';
      const artistOk = d.artistId && validArtistIds.has(d.artistId);
      console.log(
        `    drop ${d.id}  status=${d.status ?? '?'}  artist=${
          artistOk ? d.artistId : 'invalid/missing'
        }  ${linked}  square=${d.squareItemId ?? '?'}`
      );
      if (d.squareItemId) orphanSquareItemIds.push(d.squareItemId);
    }
  }

  if (crossClusterDups.length > 0) {
    console.log('');
    console.log(
      'Pass 2 — multiple linked Products share an etsyListingId (concurrent imports):'
    );
    for (const { listingId, keep, drop } of crossClusterDups) {
      totalToDelete += drop.length;
      console.log(
        `\n  etsy=${listingId} — keeping ${keep.id} (${keep.status ?? '?'}, ${
          keep.squareCache?.name ?? 'no name'
        })`
      );
      for (const d of drop) {
        console.log(
          `    drop ${d.id}  status=${d.status ?? '?'}  square=${
            d.squareItemId ?? '?'
          }  (cluster keeper duplicated)`
        );
        if (d.squareItemId) orphanSquareItemIds.push(d.squareItemId);
      }
    }
  }

  console.log('');
  console.log(
    `Summary: ${dupGroups.length} pass-1 groups, ${
      crossClusterDups.length
    } pass-2 etsy-id collisions, ${totalToDelete} products to delete, ${
      products.length - totalToDelete
    } would remain.`
  );
  console.log(
    `Square catalog items left orphaned (delete via Square dashboard or follow-up tool): ${orphanSquareItemIds.length}`
  );

  if (!isExecute) {
    console.log('');
    console.log('Dry-run complete. Re-run with --execute to apply.');
    return;
  }

  console.log('');
  console.log('Deleting duplicate Products in batches…');
  const BATCH_SIZE = 400; // Firestore commit limit is 500; leave headroom.
  let deleted = 0;
  let batch = db.batch();
  let opsInBatch = 0;
  const commitIfFull = async (): Promise<void> => {
    if (opsInBatch < BATCH_SIZE) return;
    await batch.commit();
    deleted += opsInBatch;
    console.log(`  committed ${deleted}/${totalToDelete}`);
    batch = db.batch();
    opsInBatch = 0;
  };
  for (const { drop } of dupGroups) {
    for (const d of drop) {
      batch.delete(db.collection('products').doc(d.id));
      opsInBatch++;
      await commitIfFull();
    }
  }
  for (const { drop } of crossClusterDups) {
    for (const d of drop) {
      batch.delete(db.collection('products').doc(d.id));
      opsInBatch++;
      await commitIfFull();
    }
  }
  if (opsInBatch > 0) {
    await batch.commit();
    deleted += opsInBatch;
    console.log(`  committed ${deleted}/${totalToDelete}`);
  }

  console.log('');
  console.log(`Done. Deleted ${deleted} products.`);
  console.log(
    `Reminder: ${orphanSquareItemIds.length} Square catalog items are now orphaned.`
  );
  if (orphanSquareItemIds.length > 0) {
    console.log('Orphan Square item IDs:');
    for (const id of orphanSquareItemIds) console.log(`  ${id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
