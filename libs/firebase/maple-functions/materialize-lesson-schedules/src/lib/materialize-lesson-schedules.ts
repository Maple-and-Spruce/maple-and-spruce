/**
 * materializeLessonSchedules (legacy #797)
 *
 * Keeps concrete lessons on the books for every standing arrangement, out to a
 * rolling horizon. This is the fix for the bug that mattered most: a series was
 * a finite list of dates that nothing extended, so a student's lessons simply
 * stopped on some future Tuesday — and because billing hangs off a *rendered*
 * lesson, the revenue stopped with them, silently. `/suzuki` promises rolling
 * enrollment, so that was the normal case, not an edge case.
 *
 * IDEMPOTENCE IS STRUCTURAL, NOT CHECKED
 * --------------------------------------
 * Each materialised lesson's document id is `sched-{scheduleId}-{YYYY-MM-DD}`
 * in the shop timezone, written with `create()`. A collision is not an error —
 * it is the steady state, and it is what makes exceptions free:
 *
 *   - re-running the job creates nothing;
 *   - **skipping one week** is cancelling that lesson: the document still
 *     exists, so nothing recreates it;
 *   - **moving one week** is editing that lesson's time: same document id, so
 *     the original slot is not refilled behind it.
 *
 * There is no exceptions table to keep in sync, because there is nothing an
 * exceptions table would know that the lesson itself does not.
 *
 * THE DUPLICATE TRAP
 * ------------------
 * Lessons created before schedules existed do NOT have those ids, so a schedule
 * covering the same dates would happily materialise a second lesson beside each
 * one. Two defences: the backfill tool starts an inferred schedule the day
 * *after* its series' last existing lesson, and this job additionally skips any
 * instant the student already has a lesson at, whatever that lesson's id.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { findConflictsForWindow } from '@maple/firebase/functions';
import {
  LessonRepository,
  StudentLessonScheduleRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  MAX_SCHEDULE_INTERVAL_WEEKS,
  SCHEDULE_LESSONS_AHEAD,
  lessonRoom,
  materializedLessonId,
  scheduleHorizonEnd,
  scheduleOccurrences,
} from '@maple/ts/domain';
import type { MaterializeLessonSchedulesResult } from '@maple/ts/firebase/api-types';

const TIMEZONE = 'America/New_York';

/**
 * Core logic, exported so the admin-callable twin and the integration tests can
 * drive it — `onSchedule` triggers are not reachable over HTTP in the emulator,
 * the same reason `chargeMusicTogetherInstallments` ships a callable alongside.
 */
export async function runMaterializeLessonSchedules(
  now: Date = new Date(),
  lessonsAhead: number = SCHEDULE_LESSONS_AHEAD,
  /**
   * Fill just this arrangement. Saving a new weekly time should make that
   * student's lessons, not top up everyone else's as a side effect (and report
   * their lessons as this one's).
   */
  onlyScheduleId?: string
): Promise<MaterializeLessonSchedulesResult> {
  const result: MaterializeLessonSchedulesResult = {
    schedulesConsidered: 0,
    created: 0,
    alreadyPresent: 0,
    skippedInactiveStudent: 0,
    skippedRoomConflict: 0,
  };

  // Far enough to find `lessonsAhead` dates for the sparsest cadence, with the
  // same again to spare for cancelled weeks. Only a search window: what gets
  // created is capped by the count, not by this.
  const horizonEnd = scheduleHorizonEnd(
    now,
    lessonsAhead * MAX_SCHEDULE_INTERVAL_WEEKS * 2
  );

  const [schedules, students, lessonsInWindow] = await Promise.all([
    StudentLessonScheduleRepository.findAll({ status: 'active' }),
    StudentRepository.findAll(),
    // One range query for the whole run — a single-field bound, so no composite
    // index. This is the second defence against duplicating a pre-schedule
    // lesson that happens to sit at the same instant.
    LessonRepository.findAll({ from: now, to: horizonEnd }),
  ]);

  const studentById = new Map(students.map((s) => [s.id, s]));
  const occupied = new Set(
    lessonsInWindow.map((l) => `${l.studentId}|${l.scheduledAt.getTime()}`)
  );

  for (const schedule of schedules) {
    if (onlyScheduleId && schedule.id !== onlyScheduleId) continue;
    result.schedulesConsidered++;

    const student = studentById.get(schedule.studentId);
    // A student who has left keeps their history and gains no new lessons.
    if (!student || student.status !== 'active') {
      result.skippedInactiveStudent++;
      continue;
    }

    const occurrences = scheduleOccurrences(
      schedule,
      now,
      horizonEnd,
      TIMEZONE
    );

    // Top up to `lessonsAhead` upcoming lessons, never past it. Lessons this
    // arrangement already made count, wherever they were moved to; cancelled
    // ones do not, so skipping a week pulls the next date in. Nothing is ever
    // removed: a student who already has more ahead simply gets none added.
    const own = lessonsInWindow.filter(
      (l) => l.scheduleId === schedule.id && l.scheduledAt >= now
    );
    const ownTimes = new Set(own.map((l) => l.scheduledAt.getTime()));
    let ahead = own.filter((l) => l.status !== 'cancelled').length;

    for (const occurrence of occurrences) {
      if (ahead >= lessonsAhead) break;

      if (ownTimes.has(occurrence.getTime())) {
        // Already counted above (or cancelled, which does not count).
        result.alreadyPresent++;
        continue;
      }
      if (occupied.has(`${schedule.studentId}|${occurrence.getTime()}`)) {
        // A lesson from before the arrangement at this very time: it is the
        // student's lesson that week, so it counts toward the four.
        result.alreadyPresent++;
        ahead++;
        continue;
      }

      // Two things cannot be in the room at once (legacy #841). This job runs
      // unattended, so a clash SKIPS the occurrence and is counted — throwing
      // would abandon every remaining arrangement, and writing it anyway would
      // silently double-book the room.
      //
      // The skip is not silent: the count surfaces in the result and the log,
      // because a slot nobody can teach in needs a human either way.
      const room = lessonRoom(schedule.room);
      const clashes = await findConflictsForWindow({
        room,
        scheduledAt: occurrence,
        durationMinutes: schedule.durationMinutes,
      });
      if (clashes.length > 0) {
        result.skippedRoomConflict++;
        console.warn('[materialize] room taken, occurrence skipped:', {
          scheduleId: schedule.id,
          at: occurrence.toISOString(),
          takenBy: clashes[0].event.title,
        });
        continue;
      }

      const lessonId = materializedLessonId(schedule.id, occurrence, TIMEZONE);
      const created = await LessonRepository.createWithId(lessonId, {
        studentId: schedule.studentId,
        teacherId: schedule.teacherId,
        primaryTeacherAtCreateId: student.primaryTeacherId,
        scheduledAt: occurrence,
        durationMinutes: schedule.durationMinutes,
        blockId: schedule.blockId,
        scheduleId: schedule.id,
        room,
        status: 'scheduled',
        notes: schedule.notes,
      });

      if (created) {
        result.created++;
        ahead++;
        occupied.add(`${schedule.studentId}|${occurrence.getTime()}`);
      } else {
        // The id already exists: cancelled, or moved outside the window. Either
        // way it is not a lesson happening at this date, so keep looking.
        result.alreadyPresent++;
      }
    }
  }

  console.log(
    `[lesson-schedules] ${result.schedulesConsidered} schedule(s): ` +
      `created ${result.created}, already present ${result.alreadyPresent}, ` +
      `skipped ${result.skippedInactiveStudent} for inactive students`
  );

  return result;
}

/**
 * Daily, early morning. With only four lessons kept ahead, a weekly student
 * drops to three the day after a lesson; running daily puts the fourth back
 * before Katie next looks, so "the next four" is always there to commit to.
 * A missed run just leaves one fewer lesson ahead until the next.
 */
export const materializeLessonSchedules = onSchedule(
  {
    schedule: '15 5 * * *',
    timeZone: TIMEZONE,
    region: 'us-east4',
  },
  async () => {
    await runMaterializeLessonSchedules(new Date());
  }
);
