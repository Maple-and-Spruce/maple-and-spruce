/**
 * Remove the unpaid lessons the materialiser generated far ahead (#157).
 *
 * Lessons are now booked a few at a time, when the family pays, rather than
 * generated from the weekly time. The lessons the old job already made stay
 * on the calendar and hold the Spruce Room until something removes them. This
 * removes the ones that are generated, still plain `scheduled`, unpaid,
 * uninvoiced and four or more weeks out — see
 * `remove-unbooked-generated-lessons-core.ts` for the rule.
 *
 * Deleting a lesson also removes its room booking: `onLessonWrite` deletes the
 * mirrored calendar event when the lesson document goes.
 *
 * Every lesson to be removed is written to a JSON backup first, in the system
 * temp directory rather than the repo.
 *
 * Credentials: Application Default Credentials
 *   (gcloud auth application-default login)
 *
 * Usage:
 *   npx tsx tools/remove-unbooked-generated-lessons.ts --prod            # dry-run
 *   npx tsx tools/remove-unbooked-generated-lessons.ts --prod --execute  # delete
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { coveredLessonIds, invoicedLessonIds } from '@maple/ts/domain';
import type { Invoice, LessonScheduledCharge } from '@maple/ts/domain';
import {
  DEFAULT_MIN_WEEKS_OUT,
  lessonsToRemove,
} from './remove-unbooked-generated-lessons-core';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const app = initializeApp({ projectId });
const db = getFirestore(app);

async function main(): Promise<void> {
  const now = new Date();
  console.log(
    `${projectId}: generated lessons ${DEFAULT_MIN_WEEKS_OUT}+ weeks out, unpaid` +
      (isExecute ? '' : ' (dry run)')
  );

  const [lessonsSnap, chargesSnap, invoicesSnap] = await Promise.all([
    db
      .collection('lessons')
      .where('scheduledAt', '>=', Timestamp.fromDate(now))
      .get(),
    db.collection('lessonScheduledCharges').get(),
    db.collection('invoices').get(),
  ]);

  const lessons = lessonsSnap.docs.map((doc) => ({
    id: doc.id,
    status: doc.get('status') as string,
    scheduledAt: (doc.get('scheduledAt') as Timestamp).toDate(),
    raw: doc.data(),
  }));
  const charges = chargesSnap.docs.map(
    (doc) => doc.data() as Pick<LessonScheduledCharge, 'status' | 'lessonIds'>
  );
  const invoices = invoicesSnap.docs.map(
    (doc) => doc.data() as Pick<Invoice, 'status' | 'lineItems'>
  );
  const billed = new Set([
    ...coveredLessonIds(charges),
    ...invoicedLessonIds(invoices),
  ]);

  const doomed = lessonsToRemove(lessons, billed, now);
  const students = new Set(doomed.map((l) => l.raw['studentId'] as string));

  // Ids and dates only: lesson ids carry no names, and this output lands in a
  // terminal transcript.
  for (const lesson of doomed) {
    console.log(`  ${lesson.id}  ${lesson.scheduledAt.toISOString()}`);
  }
  console.log(
    `\n${doomed.length} lesson(s) across ${students.size} student(s) ` +
      `of ${lessons.length} upcoming.`
  );

  if (!isExecute || doomed.length === 0) {
    if (!isExecute) console.log('Dry run: nothing deleted. Add --execute.');
    return;
  }

  // Outside the repo: the documents can carry lesson notes, and a backup in
  // the working tree is one `git add .` from being published.
  const backupPath = join(
    tmpdir(),
    `remove-unbooked-generated-lessons-backup-${Date.now()}.json`
  );
  writeFileSync(
    backupPath,
    JSON.stringify(
      doomed.map((l) => ({ id: l.id, ...l.raw })),
      null,
      2
    )
  );
  console.log(`Backed up ${doomed.length} lesson(s) to ${backupPath}`);

  for (let i = 0; i < doomed.length; i += 400) {
    const batch = db.batch();
    for (const lesson of doomed.slice(i, i + 400)) {
      batch.delete(db.collection('lessons').doc(lesson.id));
    }
    await batch.commit();
  }

  // Verify against what is actually stored, not against the list just deleted.
  const survivors = await Promise.all(
    doomed.map((l) => db.collection('lessons').doc(l.id).get())
  );
  const left = survivors.filter((snap) => snap.exists).length;
  console.log(`Deleted ${doomed.length - left}; ${left} still present.`);
  if (left > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
