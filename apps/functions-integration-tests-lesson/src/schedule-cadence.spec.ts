/**
 * Weekly times and their cadence, end to end (legacy #837, #157).
 *
 * The case these exist for is a real Tuesday at the studio: two students
 * alternate in the 5pm hour. Before cadence support the only way to express that
 * was to hand-create a lesson on every off-week and cancel it — about 26
 * cancellations a year per student, failing silently the first week Katie was
 * busy.
 *
 * Since #157 a weekly time books nothing on its own: it is a planning note, and
 * lessons are booked a few at a time from it (`planNextLessons`) when the family
 * pays. So what is proven here is that the weekly time is stored with its
 * cadence, that booking from it lands on the right weeks, and that two
 * alternating students never land on the same week — the failure that would put
 * two families in the room at once and bill one for the other's lesson.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse,
  CreateStudentLessonScheduleRequest,
  CreateStudentLessonScheduleResponse,
  GetLessonsRequest,
  GetLessonsResponse,
} from '@maple/ts/firebase/api-types';
import { planNextLessons } from '@maple/ts/domain';
import type { StudentLessonSchedule } from '@maple/ts/domain';

const TEACHER_ID = 'instructor-cadence';
const TZ = 'America/New_York';

const dayKey = (d: Date | string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(d));

/** Midday UTC on the next Tuesday at least `weeksOut` weeks away. */
function tuesdayFromNow(weeksOut = 1): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  const delta = ((2 - d.getUTCDay() + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta + (weeksOut - 1) * 7);
  return d;
}

async function seedStudent(id: string, name: string): Promise<void> {
  await setFirestoreDoc('students', id, {
    name,
    instrument: 'fiddle',
    isAdultStudent: true,
    primaryTeacherId: TEACHER_ID,
    isHopeScholarship: false,
    primaryContactName: name,
    primaryContactEmail: `${id}@test.com`,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function lessonsFor(studentId: string, idToken: string) {
  const res = await callFunction<GetLessonsRequest, GetLessonsResponse>({
    functionName: 'getLessons',
    data: { studentId },
    idToken,
  });
  return (res.data?.lessons ?? [])
    .filter((l) => l.status !== 'cancelled')
    .map((l) => dayKey(l.scheduledAt as unknown as string))
    .sort();
}

describe('Standing arrangement cadence (legacy #837)', () => {
  let adminUser: TestUser;
  let blockId: string;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setFirestoreDoc('instructors', TEACHER_ID, {
      name: 'Cadence Teacher',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // One wide Tuesday block so nothing here is about block fit.
    blockId = 'blk-cadence-tue';
    await setFirestoreDoc('lessonBlocks', blockId, {
      teacherId: TEACHER_ID,
      dayOfWeek: 2,
      startMinutes: 9 * 60,
      endMinutes: 20 * 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }, 30000);

  /** Save a weekly time for a student, returning what was stored. */
  async function saveWeeklyTime(
    studentId: string,
    startMinutes: number,
    startsOn: Date,
    intervalWeeks?: number,
    durationMinutes = 30
  ): Promise<StudentLessonSchedule> {
    const res = await callFunction<
      CreateStudentLessonScheduleRequest,
      CreateStudentLessonScheduleResponse
    >({
      functionName: 'createStudentLessonSchedule',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        blockId,
        dayOfWeek: 2,
        startMinutes,
        durationMinutes,
        startsOn,
        ...(intervalWeeks ? { intervalWeeks } : {}),
      } as CreateStudentLessonScheduleRequest,
      idToken: adminUser.idToken,
    });
    expect(res.status).toBe(200);
    const stored = res.data!.schedule;
    return {
      ...stored,
      startsOn: new Date(stored.startsOn as unknown as string),
      endsOn: stored.endsOn
        ? new Date(stored.endsOn as unknown as string)
        : undefined,
    };
  }

  /** Book "the next 4" from a weekly time, the way the student page does. */
  async function bookNextFour(
    studentId: string,
    schedule: StudentLessonSchedule
  ) {
    const plan = planNextLessons(schedule, [], [], new Date());
    return callFunction<CreateLessonSeriesRequest, CreateLessonSeriesResponse>({
      functionName: 'createLessonSeries',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        durationMinutes: schedule.durationMinutes,
        scheduledAts: plan.toBook,
        blockId,
        // Named explicitly: the room check only runs for a named room, while
        // the calendar mirror files an unnamed one under Spruce anyway.
        room: schedule.room ?? 'spruce',
      } as CreateLessonSeriesRequest,
      idToken: adminUser.idToken,
    });
  }

  const gapsInDays = (days: string[]) =>
    days
      .slice(1)
      .map(
        (day, i) =>
          (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${days[i]}T12:00:00Z`)) /
          86_400_000
      );

  it('books nothing on its own: the weekly time is a planning note (#157)', async () => {
    await seedStudent('cad-note', 'Note Student');

    const schedule = await saveWeeklyTime('cad-note', 9 * 60, tuesdayFromNow(1));

    expect(schedule.dayOfWeek).toBe(2);
    expect(await lessonsFor('cad-note', adminUser.idToken)).toEqual([]);
  }, 60000);

  it('books the next four a week apart when no cadence is given', async () => {
    await seedStudent('cad-weekly', 'Weekly Student');
    const start = tuesdayFromNow(1);
    const schedule = await saveWeeklyTime('cad-weekly', 10 * 60, start);

    expect((await bookNextFour('cad-weekly', schedule)).status).toBe(200);

    const days = await lessonsFor('cad-weekly', adminUser.idToken);
    expect(days).toHaveLength(4);
    expect(days[0]).toBe(dayKey(start));
    expect(gapsInDays(days)).toEqual([7, 7, 7]);
  }, 60000);

  it('books every other week for intervalWeeks 2', async () => {
    await seedStudent('cad-biweekly', 'Biweekly Student');
    const start = tuesdayFromNow(1);
    const schedule = await saveWeeklyTime('cad-biweekly', 11 * 60, start, 2);

    expect(schedule.intervalWeeks).toBe(2);
    expect((await bookNextFour('cad-biweekly', schedule)).status).toBe(200);

    const days = await lessonsFor('cad-biweekly', adminUser.idToken);
    expect(days).toHaveLength(4);
    expect(days[0]).toBe(dayKey(start));
    expect(gapsInDays(days)).toEqual([14, 14, 14]);
  }, 60000);

  it('never puts two alternating students in the same hour on one week', async () => {
    // Two students a week apart in the same hour, as at the studio.
    await seedStudent('cad-alt-a', 'Alternating A');
    await seedStudent('cad-alt-b', 'Alternating B');

    const a = await saveWeeklyTime('cad-alt-a', 17 * 60, tuesdayFromNow(1), 2, 60);
    const b = await saveWeeklyTime('cad-alt-b', 17 * 60, tuesdayFromNow(2), 2, 60);
    expect((await bookNextFour('cad-alt-a', a)).status).toBe(200);
    expect((await bookNextFour('cad-alt-b', b)).status).toBe(200);

    const daysA = await lessonsFor('cad-alt-a', adminUser.idToken);
    const daysB = await lessonsFor('cad-alt-b', adminUser.idToken);

    expect(daysA).toHaveLength(4);
    expect(daysB).toHaveLength(4);
    // The assertion this whole feature exists for.
    expect(daysA.filter((d) => daysB.includes(d))).toEqual([]);
    // And they genuinely interleave rather than merely differing.
    expect(gapsInDays([...daysA, ...daysB].sort())).toEqual([
      7, 7, 7, 7, 7, 7, 7,
    ]);
  }, 60000);

  it('refuses to book one student into the hour another already holds', async () => {
    // The room check is what keeps a mistaken weekly time from double-booking.
    await seedStudent('cad-clash', 'Clashing Student');
    const clash = await saveWeeklyTime('cad-clash', 17 * 60, tuesdayFromNow(1), 2, 60);

    const res = await bookNextFour('cad-clash', clash);

    expect(res.status).not.toBe(200);
    expect(await lessonsFor('cad-clash', adminUser.idToken)).toEqual([]);
  }, 60000);

  it('refuses a cadence that is not a whole number of weeks', async () => {
    await seedStudent('cad-bad', 'Bad Cadence');
    const res = await callFunction<CreateStudentLessonScheduleRequest>({
      functionName: 'createStudentLessonSchedule',
      data: {
        studentId: 'cad-bad',
        teacherId: TEACHER_ID,
        blockId,
        dayOfWeek: 2,
        startMinutes: 13 * 60,
        durationMinutes: 30,
        startsOn: tuesdayFromNow(1),
        intervalWeeks: 2.5,
      } as CreateStudentLessonScheduleRequest,
      idToken: adminUser.idToken,
    });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.error)).toMatch(/whole number/i);
  }, 30000);

  it('refuses a cadence so long the arrangement would rarely produce a lesson', async () => {
    await seedStudent('cad-long', 'Long Cadence');
    const res = await callFunction<CreateStudentLessonScheduleRequest>({
      functionName: 'createStudentLessonSchedule',
      data: {
        studentId: 'cad-long',
        teacherId: TEACHER_ID,
        blockId,
        dayOfWeek: 2,
        startMinutes: 13 * 60,
        durationMinutes: 30,
        startsOn: tuesdayFromNow(1),
        intervalWeeks: 12,
      } as CreateStudentLessonScheduleRequest,
      idToken: adminUser.idToken,
    });

    expect(res.status).toBe(400);
  }, 30000);
});

/**
 * Reading arrangements across the whole studio (legacy #838).
 *
 * The day column shows one day for *all* teachers, so the read behind it has to
 * actually return all of them. It did not: `getStudentLessonSchedules` scoped
 * by the caller's linked instructor record without checking for admin, so an
 * admin who also teaches — which Katie does — silently saw only her own.
 */
describe('getStudentLessonSchedules scope (legacy #838)', () => {
  const TEACHING_ADMIN = 'instructor-teaching-admin';
  const OTHER_TEACHER = 'instructor-someone-else';
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // The admin is ALSO an instructor — the case that was broken.
    await setFirestoreDoc('instructors', TEACHING_ADMIN, {
      name: 'Katie',
      status: 'active',
      uid: adminUser.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setFirestoreDoc('instructors', OTHER_TEACHER, {
      name: 'Nathan',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    for (const [id, teacherId] of [
      ['sched-mine', TEACHING_ADMIN],
      ['sched-theirs', OTHER_TEACHER],
    ] as const) {
      await setFirestoreDoc('studentLessonSchedules', id, {
        studentId: `student-for-${teacherId}`,
        teacherId,
        blockId: 'blk-any',
        dayOfWeek: 2,
        startMinutes: 16 * 60,
        durationMinutes: 30,
        startsOn: new Date(),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }, 30000);

  it('returns every teacher’s arrangements to an admin who also teaches', async () => {
    const result = await callFunction<
      Record<string, never>,
      { schedules: { id: string; teacherId: string }[] }
    >({
      functionName: 'getStudentLessonSchedules',
      data: {},
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    const ids = (result.data?.schedules ?? []).map((s) => s.id).sort();
    expect(ids).toEqual(['sched-mine', 'sched-theirs']);
  }, 30000);

  it('still narrows to one teacher when the admin asks for one', async () => {
    const result = await callFunction<
      { teacherId: string },
      { schedules: { id: string }[] }
    >({
      functionName: 'getStudentLessonSchedules',
      data: { teacherId: OTHER_TEACHER },
      idToken: adminUser.idToken,
    });

    expect((result.data?.schedules ?? []).map((s) => s.id)).toEqual([
      'sched-theirs',
    ]);
  }, 30000);
});
