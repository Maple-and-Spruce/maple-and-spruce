/**
 * One-time backfill for `Discount.program` (#791).
 *
 * **This is a prerequisite for the admin Discounts pages, not a tidy-up.**
 *
 * Program scoping made `program` required and the pages filter on it in the
 * Firestore query. Firestore can only satisfy that for documents that carry
 * the field:
 *
 *   "A document is included in the index only if it has an indexed value set
 *    for every field used in the index. If the index definition refers to a
 *    field for which the document has no value set, that document won't appear
 *    in the index... the document will never be returned as a result for any
 *    query based on the index."
 *   https://firebase.google.com/docs/firestore/query-data/index-overview
 *
 * `!=` is no escape either — not-equal and not-in also exclude documents where
 * the field does not exist. So until this runs, every discount written before
 * scoping is invisible on BOTH admin pages.
 *
 * Assigns `classes` to everything it touches, which is a statement of fact
 * rather than a default: Music Together had no discount support before #791,
 * so no pre-existing code could have been its. See
 * `backfill-discount-program-core.ts` for the selection rules and their tests.
 *
 * Idempotent — a second run selects nothing, so it is safe to re-run after a
 * partial failure.
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
import {
  selectForBackfill,
  describeDoc,
  chunkForBatches,
  BACKFILL_PROGRAM,
} from './backfill-discount-program-core';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

async function main(): Promise<void> {
  console.log(
    `Backfill Discount.program on ${projectId} (${
      isExecute ? 'EXECUTE' : 'DRY-RUN'
    })`
  );

  const db = getFirestore(initializeApp({ projectId }));

  // Read EVERY document rather than querying for a missing `program`: the very
  // behaviour this backfill exists to fix means no query can select the
  // documents that lack the field.
  const snapshot = await db.collection('discounts').get();

  const docs = snapshot.docs.map((doc) => ({
    id: doc.id,
    code: doc.data()['code'],
    program: doc.data()['program'],
    ref: doc.ref,
  }));

  const pending = selectForBackfill(docs);

  console.log(
    `${docs.length} discount(s); ${pending.length} need a program.`
  );

  for (const doc of pending) {
    console.log(`  ${describeDoc(doc)}`);
  }

  if (pending.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (!isExecute) {
    console.log('\nDry run — pass --execute to write. No documents changed.');
    return;
  }

  let written = 0;
  for (const chunk of chunkForBatches(pending)) {
    const batch = db.batch();
    for (const doc of chunk) {
      // `update`, not `set(…, {merge:true})`: these documents definitely exist,
      // and update fails loudly if one was deleted mid-run rather than quietly
      // recreating it as a discount with no type or amount.
      batch.update(doc.ref, {
        program: BACKFILL_PROGRAM,
        updatedAt: new Date(),
      });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`Committed ${written}/${pending.length}.`);
  }

  console.log(`\nBackfilled ${written} discount(s) to '${BACKFILL_PROGRAM}'.`);
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
