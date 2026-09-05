/**
 * materializeLessonSchedules (#797)
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
import { Functions, Role } from '@maple/firebase/functions';
import {
  LessonRepository,
  StudentLessonScheduleRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  DEFAULT_SCHEDULE_HORIZON_WEEKS,
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
  horizonWeeks: number = DEFAULT_SCHEDULE_HORIZON_WEEKS
): Promise<MaterializeLessonSchedulesResult> {
  const result: MaterializeLessonSchedulesResult = {
    schedulesConsidered: 0,
    created: 0,
    alreadyPresent: 0,
    skippedInactiveStudent: 0,
  };

  const horizonEnd = scheduleHorizonEnd(now, horizonWeeks);

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

    for (const occurrence of occurrences) {
      if (occupied.has(`${schedule.studentId}|${occurrence.getTime()}`)) {
        result.alreadyPresent++;
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
        room: schedule.room,
        status: 'scheduled',
        notes: schedule.notes,
      });

      if (created) {
        result.created++;
        occupied.add(`${schedule.studentId}|${occurrence.getTime()}`);
      } else {
        // The id already exists — cancelled, moved, or simply already made.
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
 * Weekly, early Monday. Nothing depends on the exact moment — the horizon is
 * twelve weeks out, so a missed run costs nothing and the next one catches up.
 */
export const materializeLessonSchedules = onSchedule(
  {
    schedule: '15 5 * * 1',
    timeZone: TIMEZONE,
    region: 'us-east4',
  },
  async () => {
    await runMaterializeLessonSchedules(new Date());
  }
);

/** Admin-callable twin — same logic on demand, and what the integration tests drive. */
export const triggerMaterializeLessonSchedules = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<Record<string, never>, MaterializeLessonSchedulesResult>(async () => {
    return runMaterializeLessonSchedules(new Date());
  });
