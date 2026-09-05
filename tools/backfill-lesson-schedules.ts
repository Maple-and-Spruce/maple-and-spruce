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
 * ONE LESSON IS NOT A PATTERN, AND AN OLD PATTERN IS NOT A CURRENT ONE
 * --------------------------------------------------------------------
 * A first prod dry run showed both failure modes clearly, which is why this
 * tool has two guards it did not start with:
 *
 *   - Three "arrangements" were inferred from a single lesson each. A lone
 *     lesson carrying a seriesId is usually a make-up, not a standing slot;
 *     turning it into an open-ended weekly commitment invents lessons nobody
 *     agreed to — and they auto-invoice. `--min-lessons` (default 2) is the
 *     floor for calling something a pattern.
 *   - One student had three arrangements at 13:00, 13:30 and 15:00 on the same
 *     weekday. That is one student whose lesson time MOVED, not a student with
 *     three weekly lessons.
 *   - Two DIFFERENT students both held Tuesday 17:00 with the same teacher, one
 *     running through October and the other through December. That is a slot
 *     that was handed from one student to the next — not a teacher who taught
 *     two people at once. Left alone it would have materialised a permanent
 *     weekly double-booking.
 *
 * So an arrangement is only still `active` if nothing later supersedes it,
 * where "supersedes" means a later arrangement for the same **student**, or a
 * later arrangement in the same **teacher + weekday + time slot**. Everything
 * else is recorded as `ended` at its own last lesson, which is what actually
 * happened to it.
 *
 * Usage — dev by default, like every other tool here; `--prod` is deliberate:
 *   npx tsx tools/backfill-lesson-schedules.ts                      # dev, dry run
 *   npx tsx tools/backfill-lesson-schedules.ts --execute            # dev, writes
 *   npx tsx tools/backfill-lesson-schedules.ts --prod               # prod, dry run
 *   npx tsx tools/backfill-lesson-schedules.ts --prod --execute     # prod, writes
 *
 * Needs application-default credentials for the target project:
 *   gcloud auth application-default login --account katie@mapleandsprucefolkarts.com
 * A `7 PERMISSION_DENIED` here is almost always stale ADC, not a missing role.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');

/**
 * How many lessons a series needs before it counts as a standing arrangement.
 * One is a make-up; two is the beginning of a pattern.
 */
const minLessonsArg = process.argv.find((a) => a.startsWith('--min-lessons='));
const MIN_LESSONS = minLessonsArg
  ? Number(minLessonsArg.split('=')[1])
  : 2;
// Default to dev. A backfill that silently picks its target from whatever
// ambient credentials happen to say is one bad shell away from rewriting prod.
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const TIME_ZONE = 'America/New_York';
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const db = getFirestore(initializeApp({ projectId }));

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
    `[${projectId}] ${lessons.length} lesson(s); ${groups.size} arrangement(s) to infer` +
      (isExecute ? '' : '  (dry run — pass --execute to write)')
  );

  let created = 0;
  let stamped = 0;
  let skippedNoBlock = 0;
  let skippedTooFew = 0;
  let endedSupersededCount = 0;

  // Drop anything too short to be a pattern before deciding which arrangement
  // is current — otherwise a stray make-up could out-date the real one.
  const patterns = [...groups.entries()].filter(([key, rows]) => {
    if (rows.length >= MIN_LESSONS) return true;
    skippedTooFew++;
    console.log(
      `  skip (${rows.length} lesson, below --min-lessons=${MIN_LESSONS}): ${key}`
    );
    return false;
  });

  // An arrangement is superseded when something later replaced it. Two ways
  // that happens, and both were present in the first prod dry run:
  //   - the same STUDENT moved to a different time;
  //   - the same teacher's SLOT was handed to a different student.
  // Either way only the latest is still in force; the rest are history.
  const lastOf = (rows: LessonRow[]) =>
    Math.max(...rows.map((r) => r.scheduledAt.getTime()));

  const latestPerStudent = new Map<string, number>();
  const latestPerSlot = new Map<string, number>();
  for (const [, rows] of patterns) {
    const first = rows[0];
    const last = lastOf(rows);
    const studentKey = `${first.studentId}|${first.teacherId}`;
    const slotKey = [
      first.teacherId,
      weekdayInZone(first.scheduledAt),
      minutesInZone(first.scheduledAt),
    ].join('|');
    latestPerStudent.set(
      studentKey,
      Math.max(latestPerStudent.get(studentKey) ?? 0, last)
    );
    latestPerSlot.set(
      slotKey,
      Math.max(latestPerSlot.get(slotKey) ?? 0, last)
    );
  }

  for (const [key, rows] of patterns) {
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

    // Current only if nothing later replaced it — neither a later time for this
    // student, nor a later student in this teacher's slot.
    const studentKey = `${first.studentId}|${first.teacherId}`;
    const slotKey = [
      first.teacherId,
      weekdayInZone(first.scheduledAt),
      minutesInZone(first.scheduledAt),
    ].join('|');
    const mine = last.scheduledAt.getTime();
    const isCurrent =
      latestPerStudent.get(studentKey) === mine &&
      latestPerSlot.get(slotKey) === mine;
    if (!isCurrent) endedSupersededCount++;

    const schedule = {
      studentId: first.studentId,
      teacherId: first.teacherId,
      blockId,
      dayOfWeek: weekdayInZone(first.scheduledAt),
      startMinutes: minutesInZone(first.scheduledAt),
      durationMinutes: first.durationMinutes,
      room: first.room,
      startsOn,
      // A superseded arrangement is recorded as having ended when it actually
      // ended, so the history reads true and nothing materialises from it.
      ...(isCurrent
        ? { status: 'active' as const }
        : { status: 'ended' as const, endsOn: last.scheduledAt }),
      notes: `Inferred from series ${first.seriesId} (${rows.length} lessons through ${last.scheduledAt.toISOString().slice(0, 10)})`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log(
      `  ${isCurrent ? 'ACTIVE' : 'ended '} ` +
        `${WEEKDAY_SHORT[schedule.dayOfWeek]} ` +
        `${String(Math.floor(schedule.startMinutes / 60)).padStart(2, '0')}:` +
        `${String(schedule.startMinutes % 60).padStart(2, '0')} ` +
        `${schedule.durationMinutes}min · teacher ${schedule.teacherId.slice(0, 8)} · ` +
        `student ${schedule.studentId.slice(0, 8)} · ` +
        `${rows.length} existing lesson(s) · takes over ${startsOn.toISOString().slice(0, 10)}`
    );

    if (!isExecute) continue;

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

  const willCreate = patterns.length - skippedNoBlock;
  console.log(
    (isExecute
      ? `Created ${created} schedule(s); stamped ${stamped} lesson(s).`
      : `Would create ${willCreate} schedule(s).`) +
      ` ${endedSupersededCount} recorded as ended (superseded — the student` +
      ` moved, or the slot went to someone else); ${skippedTooFew} skipped as` +
      ` too short to be a pattern; ${skippedNoBlock} skipped without a block.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
