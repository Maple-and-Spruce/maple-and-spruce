/**
 * Find lesson series that a clock change moved by an hour (#304). Read-only.
 *
 * Before #304, "Schedule lessons → series" and Backfill stepped each lesson by
 * 7 * 24h. A series started before a clock change landed every later lesson an
 * hour off on the wall clock (4:00 PM became 3:00 PM after the Nov 1 2026
 * fall-back). This lists series whose lessons after the change sit at a
 * different studio-time than the ones before it.
 *
 * Prints only series and lesson document ids: open them in the admin to fix.
 *
 * Credentials: Application Default Credentials
 *   (gcloud auth application-default login)
 *
 * Usage:
 *   npx tsx tools/check-dst-shifted-series.ts          # dev
 *   npx tsx tools/check-dst-shifted-series.ts --prod
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { SCHEDULE_TIME_ZONE, minutesOfDayInZone } from '@maple/ts/domain';

const isProd = process.argv.includes('--prod');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';
initializeApp({ projectId });
const db = getFirestore();

/** The clock changes the old code could have stepped across. */
const CLOCK_CHANGES = [
  new Date('2026-03-08T07:00:00Z'),
  new Date('2026-11-01T06:00:00Z'),
  new Date('2027-03-14T07:00:00Z'),
];

interface SeriesLesson {
  id: string;
  at: Date;
  status: string;
}

async function main(): Promise<void> {
  const snap = await db
    .collection('lessons')
    .where('scheduledAt', '>=', Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')))
    .get();

  const bySeries = new Map<string, SeriesLesson[]>();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d['seriesId']) continue;
    const list = bySeries.get(d['seriesId']) ?? [];
    list.push({ id: doc.id, at: d['scheduledAt'].toDate(), status: d['status'] });
    bySeries.set(d['seriesId'], list);
  }

  let shifted = 0;
  for (const [seriesId, lessons] of bySeries) {
    lessons.sort((a, b) => a.at.getTime() - b.at.getTime());
    const first = minutesOfDayInZone(lessons[0].at, SCHEDULE_TIME_ZONE);
    const crosses = CLOCK_CHANGES.some(
      (c) => lessons[0].at < c && lessons[lessons.length - 1].at >= c,
    );
    if (!crosses) continue;
    const off = lessons.filter(
      (l) =>
        l.status !== 'cancelled' &&
        minutesOfDayInZone(l.at, SCHEDULE_TIME_ZONE) !== first,
    );
    if (off.length === 0) continue;
    shifted++;
    console.log(
      `series ${seriesId}: ${off.length} of ${lessons.length} lessons off the first lesson's time — ${off
        .map((l) => `${l.id} (${l.status})`)
        .join(', ')}`,
    );
  }

  console.log(
    `${projectId}: ${bySeries.size} series checked, ${shifted} with lessons shifted by a clock change`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
