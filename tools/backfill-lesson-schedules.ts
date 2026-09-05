/**
 * Infer standing schedules from existing lesson series (#797).
 *
 * Before schedules existed, a recurring arrangement was N `Lesson` rows sharing
 * a `seriesId` and nothing more. This reads those rows back into the
 * arrangement they were always expressing, so Katie can edit one object instead
 * of a list — and so the series stops running out.
 *
 * THE DUPLICATE TRAP THIS AVOIDS
 * ------------------------------
 * Lessons created before schedules do NOT have the deterministic
 * `sched-{id}-{date}` document id the materialiser relies on. A schedule whose
 * window covered the same dates would therefore create a *second* lesson beside
 * each existing one, silently doubling a student's week.
 *
 * So each inferred schedule starts the day **after** its series' last existing
 * lesson: the arrangement takes over exactly where the old rows stop. (The
 * materialiser has a second defence — it skips any instant a student already
 * has a lesson at — but relying on that alone would mean the correctness of a
 * migration depended on a runtime guard.)
 *
 * Usage:
 *   npx tsx tools/backfill-lesson-schedules.ts            # dry run (default)
 *   npx tsx tools/backfill-lesson-schedules.ts --apply    # write
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const TIME_ZONE = 'America/New_York';
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

interface LessonRow {
  id: string;
  studentId: string;
  teacherId: string;
  seriesId?: string;
  blockId?: string | null;
  scheduleId?: string;
  room?: string;
  durationMinutes: number;
  scheduledAt: Date;
  status: string;
}

function weekdayInZone(d: Date): number {
  return WEEKDAY_SHORT.indexOf(
    new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: TIME_ZONE,
    }).format(d)
  );
}

function minutesInZone(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIME_ZONE,
  }).formatToParts(d);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? '0');
  return get('hour') * 60 + get('minute');
}

async function main(): Promise<void> {
  const snapshot = await db.collection('lessons').get();
  const lessons: LessonRow[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      studentId: data.studentId,
      teacherId: data.teacherId,
      seriesId: data.seriesId,
      blockId: data.blockId ?? null,
      scheduleId: data.scheduleId,
      room: data.room,
      durationMinutes: data.durationMinutes,
      scheduledAt: data.scheduledAt.toDate(),
      status: data.status,
    };
  });

  // Group by the arrangement the rows were expressing: same series, same
  // weekday and wall-clock time. A series whose rows disagree on weekday or
  // time was never one standing arrangement, so it becomes more than one.
  const groups = new Map<string, LessonRow[]>();
  for (const lesson of lessons) {
    if (!lesson.seriesId) continue; // one-offs were never an arrangement
    if (lesson.scheduleId) continue; // already migrated
    if (lesson.status === 'cancelled') continue; // cancellations are exceptions
    const key = [
      lesson.seriesId,
      lesson.studentId,
      lesson.teacherId,
      weekdayInZone(lesson.scheduledAt),
      minutesInZone(lesson.scheduledAt),
      lesson.durationMinutes,
    ].join('|');
    const bucket = groups.get(key) ?? [];
    bucket.push(lesson);
    groups.set(key, bucket);
  }

  console.log(
    `${lessons.length} lesson(s); ${groups.size} arrangement(s) to infer` +
      (APPLY ? '' : '  (dry run — pass --apply to write)')
  );

  let created = 0;
  let stamped = 0;
  let skippedNoBlock = 0;

  for (const [key, rows] of groups) {
    rows.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const first = rows[0];
    const last = rows[rows.length - 1];

    // A schedule must sit in a block. A grandfathered series with none stays as
    // it is rather than being given an arbitrary one — it surfaces as
    // "needs a block" (#807) for a human to resolve, which is the honest state.
    const blockId = rows.find((r) => r.blockId)?.blockId;
    if (!blockId) {
      skippedNoBlock++;
      console.log(`  skip (no block): ${key}  ${rows.length} lesson(s)`);
      continue;
    }

    // Start the day AFTER the last existing lesson. See the header comment.
    const startsOn = new Date(last.scheduledAt.getTime() + 86_400_000);

    const schedule = {
      studentId: first.studentId,
      teacherId: first.teacherId,
      blockId,
      dayOfWeek: weekdayInZone(first.scheduledAt),
      startMinutes: minutesInZone(first.scheduledAt),
      durationMinutes: first.durationMinutes,
      room: first.room,
      startsOn,
      status: 'active' as const,
      notes: `Inferred from series ${first.seriesId} (${rows.length} lessons through ${last.scheduledAt.toISOString().slice(0, 10)})`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log(
      `  ${WEEKDAY_SHORT[schedule.dayOfWeek]} ` +
        `${String(Math.floor(schedule.startMinutes / 60)).padStart(2, '0')}:` +
        `${String(schedule.startMinutes % 60).padStart(2, '0')} ` +
        `${schedule.durationMinutes}min · student ${schedule.studentId} · ` +
        `${rows.length} existing lesson(s) · takes over ${startsOn.toISOString().slice(0, 10)}`
    );

    if (!APPLY) continue;

    const ref = await db.collection('studentLessonSchedules').add(schedule);
    created++;

    // Stamp the existing rows so the UI can group them under the arrangement.
    // They keep their own document ids — renaming would break the
    // invoice lineItem.lessonId references pointing at them.
    const batch = db.batch();
    for (const row of rows) {
      batch.update(db.collection('lessons').doc(row.id), {
        scheduleId: ref.id,
      });
      stamped++;
    }
    await batch.commit();
  }

  console.log(
    APPLY
      ? `Created ${created} schedule(s); stamped ${stamped} lesson(s); skipped ${skippedNoBlock} without a block.`
      : `Would create ${groups.size - skippedNoBlock} schedule(s); ${skippedNoBlock} skipped without a block.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
