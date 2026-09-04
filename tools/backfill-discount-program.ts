/**
 * One-time backfill for `Discount.program` (#791).
 *
 * Program scoping added a required `program` field ('classes' | 'music-together')
 * to discounts. Every document written before that has no `program` at all.
 *
 * The repository already reads those as `classes` (the back-fill in
 * `docToDiscount`) and filters by program AFTER the read, so the admin pages are
 * correct with or without this script — see the comment on
 * `DiscountRepository.findAll` for why the filter cannot live in the query:
 *
 *   "A document is included in the index only if it has an indexed value set for
 *    every field used in the index. If the index definition refers to a field for
 *    which the document has no value set, that document won't appear in the
 *    index... the document will never be returned as a result for any query based
 *    on the index."
 *   — https://firebase.google.com/docs/firestore/query-data/index-overview
 *
 * So why run this at all? Two reasons:
 *
 *   1. The stored data should match the model. Right now the field is required
 *      by the type and absent from the data, and every reader depends on a
 *      compatibility shim to paper over that.
 *   2. It is what keeps a Firestore-side filter available later. `discounts`
 *      grows on its own — `create-registration` mints a referral code per
 *      registration when a class configures one — so if the collection ever
 *      gets large enough that reading it whole for an admin page stops being
 *      free, moving the filter back into the query needs every document to
 *      carry the field. This is the prerequisite for that, not a fix for a bug.
 *
 * Assigns `classes` to everything it touches, which is a statement of fact
 * rather than a default: Music Together had no discount support before #791, so
 * no pre-existing code could have belonged to it.
 *
 * Credentials: Application Default Credentials
 *   (gcloud auth application-default login)
 *
 * Usage:
 *   npx tsx tools/backfill-discount-program.ts                   # dry-run, dev
 *   npx tsx tools/backfill-discount-program.ts --prod            # dry-run, prod
 *   npx tsx tools/backfill-discount-program.ts --execute         # write, dev
 *   npx tsx tools/backfill-discount-program.ts --prod --execute  # write, prod
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

/** Firestore caps a batched write at 500 operations. */
const BATCH_LIMIT = 500;

async function main(): Promise<void> {
  console.log(
    `Backfill Discount.program on ${projectId} (${
      isExecute ? 'EXECUTE' : 'DRY-RUN'
    })`
  );

  const db = getFirestore(initializeApp({ projectId }));

  // Read every document rather than querying for a missing `program`: the very
  // behaviour this backfill exists to work around means no query can select
  // documents that lack the field.
  const snapshot = await db.collection('discounts').get();

  const missing = snapshot.docs.filter(
    (doc) => typeof doc.data()['program'] !== 'string'
  );

  console.log(
    `${snapshot.size} discount(s); ${missing.length} without a program.`
  );

  if (missing.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const doc of missing) {
    console.log(`  ${doc.data()['code'] ?? doc.id} -> classes`);
  }

  if (!isExecute) {
    console.log('\nDry run — pass --execute to write. No documents changed.');
    return;
  }

  let written = 0;
  for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of missing.slice(i, i + BATCH_LIMIT)) {
      // `update`, not `set(..., {merge:true})`: these documents definitely
      // exist, and update fails loudly if one was deleted mid-run rather than
      // silently recreating it as a discount with no type or amount.
      batch.update(doc.ref, { program: 'classes', updatedAt: new Date() });
    }
    await batch.commit();
    written += Math.min(BATCH_LIMIT, missing.length - i);
    console.log(`Committed ${written}/${missing.length}.`);
  }

  console.log(`\nBackfilled ${written} discount(s) to program='classes'.`);
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
