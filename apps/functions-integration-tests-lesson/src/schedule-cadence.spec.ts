/**
 * Biweekly standing arrangements, end to end (legacy #837).
 *
 * The case these exist for is Katie's real Tuesday: Marisol and Odette alternate
 * in the 5pm hour. Before cadence support the only way to express that was to
 * hand-create a lesson on every off-week and cancel it — about 26 cancellations
 * a year per student, failing silently the first week she was busy.
 *
 * So what is proven here is not "does 2 mean 2". It is that two alternating
 * arrangements never land on the same week, which is the failure that would put
 * two families in the room at once and, once #81 charges cards, bill one for
 * the other's lesson.
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
  CreateStudentLessonScheduleRequest,
  CreateStudentLessonScheduleResponse,
  GetLessonsRequest,
  GetLessonsResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
} from '@maple/ts/firebase/api-types';

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

  it('materialises every week when no cadence is given', async () => {
    await seedStudent('cad-weekly', 'Weekly Student');
    const start = tuesdayFromNow(1);

    const res = await callFunction<
      CreateStudentLessonScheduleRequest,
      CreateStudentLessonScheduleResponse
    >({
      functionName: 'createStudentLessonSchedule',
      data: {
        studentId: 'cad-weekly',
        teacherId: TEACHER_ID,
        blockId,
        dayOfWeek: 2,
        startMinutes: 10 * 60,
        durationMinutes: 30,
        startsOn: start,
      } as CreateStudentLessonScheduleRequest,
      idToken: adminUser.idToken,
    });

    expect(res.status).toBe(200);

    const days = await lessonsFor('cad-weekly', adminUser.idToken);
    expect(days.length).toBeGreaterThan(6);
    // Consecutive lessons are exactly 7 days apart.
    for (let i = 1; i < days.length; i++) {
      const gap =
        (Date.parse(`${days[i]}T12:00:00Z`) -
          Date.parse(`${days[i - 1]}T12:00:00Z`)) /
        86_400_000;
      expect(gap).toBe(7);
    }
  }, 60000);

  it('materialises every other week for intervalWeeks 2', async () => {
    await seedStudent('cad-biweekly', 'Biweekly Student');
    const start = tuesdayFromNow(1);

    const res = await callFunction<
      CreateStudentLessonScheduleRequest,
      CreateStudentLessonScheduleResponse
    >({
      functionName: 'createStudentLessonSchedule',
      data: {
        studentId: 'cad-biweekly',
        teacherId: TEACHER_ID,
        blockId,
        dayOfWeek: 2,
        startMinutes: 11 * 60,
        durationMinutes: 30,
        startsOn: start,
        intervalWeeks: 2,
      } as CreateStudentLessonScheduleRequest,
      idToken: adminUser.idToken,
    });

    expect(res.status).toBe(200);

    const days = await lessonsFor('cad-biweekly', adminUser.idToken);
    expect(days.length).toBeGreaterThan(3);
    for (let i = 1; i < days.length; i++) {
      const gap =
        (Date.parse(`${days[i]}T12:00:00Z`) -
          Date.parse(`${days[i - 1]}T12:00:00Z`)) /
        86_400_000;
      expect(gap).toBe(14);
    }
    // Half the lessons of a weekly student over the same horizon.
    expect(days[0]).toBe(dayKey(start));
  }, 60000);

  it('never puts two alternating students in the same hour on one week', async () => {
    // Marisol and Odette's real arrangement, a week apart in the same slot.
    await seedStudent('cad-marisol', 'Marisol');
    await seedStudent('cad-odette', 'Odette');

    for (const [id, weeksOut] of [
      ['cad-odette', 1],
      ['cad-marisol', 2],
    ] as const) {
      const res = await callFunction<CreateStudentLessonScheduleRequest>({
        functionName: 'createStudentLessonSchedule',
        data: {
          studentId: id,
          teacherId: TEACHER_ID,
          blockId,
          dayOfWeek: 2,
          startMinutes: 17 * 60,
          durationMinutes: 60,
          startsOn: tuesdayFromNow(weeksOut),
          intervalWeeks: 2,
        } as CreateStudentLessonScheduleRequest,
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(200);
    }

    const odette = await lessonsFor('cad-odette', adminUser.idToken);
    const marisol = await lessonsFor('cad-marisol', adminUser.idToken);

    expect(odette.length).toBeGreaterThan(2);
    expect(marisol.length).toBeGreaterThan(2);
    // The assertion this whole feature exists for.
    expect(odette.filter((d) => marisol.includes(d))).toEqual([]);

    // And they genuinely interleave rather than merely differing.
    const merged = [...odette, ...marisol].sort();
    for (let i = 1; i < merged.length; i++) {
      const gap =
        (Date.parse(`${merged[i]}T12:00:00Z`) -
          Date.parse(`${merged[i - 1]}T12:00:00Z`)) /
        86_400_000;
      expect(gap).toBe(7);
    }
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

/**
 * A moved week must not break the next arrangement (#117).
 *
 * A materialised lesson's id carries the occurrence date it was made for, so
 * moving that lesson to another date leaves the original slot looking unfilled.
 * Re-materialising then collides on the old id — and that collision is meant to
 * be a **no-op**, which is the whole reason exceptions need no exceptions table.
 *
 * When the collision escaped instead, every caller went down with it: creating a
 * standing arrangement for an unrelated student, and the nightly job for the
 * whole studio. Hit in dev for real.
 *
 * This only reproduces on the REST transport, which is what dev and prod use and
 * what the harness now forces (`FIRESTORE_PREFER_REST=1`). On the emulator's
 * default gRPC the old guard caught the collision and this passed regardless —
 * that is why two rounds of integration tests missed it.
 */
describe('a moved lesson and the arrangements that follow it (#117)', () => {
  let adminUser: TestUser;
  const BLOCK_ID = 'blk-moved-tue';

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
    await setFirestoreDoc('lessonBlocks', BLOCK_ID, {
      teacherId: TEACHER_ID,
      dayOfWeek: 2,
      startMinutes: 9 * 60,
      endMinutes: 20 * 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }, 30000);

  async function scheduleFor(
    studentId: string,
    startMinutes: number
  ): Promise<number> {
    const res = await callFunction<
      CreateStudentLessonScheduleRequest,
      CreateStudentLessonScheduleResponse
    >({
      functionName: 'createStudentLessonSchedule',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        blockId: BLOCK_ID,
        dayOfWeek: 2,
        startMinutes,
        durationMinutes: 30,
        startsOn: tuesdayFromNow(1),
      } as CreateStudentLessonScheduleRequest,
      idToken: adminUser.idToken,
    });
    expect(res.status).toBe(200);
    return res.data!.lessonsCreated ?? 0;
  }

  it('lets the next student be set up, and does not refill the slot', async () => {
    await seedStudent('moved-first', 'First Student');
    expect(await scheduleFor('moved-first', 11 * 60)).toBeGreaterThan(6);

    const before = await callFunction<GetLessonsRequest, GetLessonsResponse>({
      functionName: 'getLessons',
      data: { studentId: 'moved-first' },
      idToken: adminUser.idToken,
    });
    const materialised = (before.data?.lessons ?? []).filter((l) =>
      l.id.startsWith('sched-')
    );
    expect(materialised.length).toBeGreaterThan(6);

    // Move the last week to a Tuesday before the arrangement starts — the same
    // shape as an admin pulling one lesson earlier. No sibling occupies it, and
    // the schedule generates nothing there, so the only thing left behind is the
    // original slot's id.
    const moving = materialised[materialised.length - 1];
    const earlier = new Date(tuesdayFromNow(1).getTime() - 7 * 86_400_000);
    earlier.setUTCHours(16, 0, 0, 0);

    const moved = await callFunction<UpdateLessonRequest, UpdateLessonResponse>({
      functionName: 'updateLesson',
      data: { id: moving.id, scheduledAt: earlier },
      idToken: adminUser.idToken,
    });
    expect(moved.status).toBe(200);

    // The failure: this used to come back 400, carrying a REST 409 about the
    // *first* student's lesson id, for a student that has nothing to do with it.
    await seedStudent('moved-second', 'Second Student');
    expect(await scheduleFor('moved-second', 12 * 60)).toBeGreaterThan(6);

    // And the moved week is not quietly refilled behind itself, which is the
    // property the deterministic id exists to give.
    const after = await callFunction<GetLessonsRequest, GetLessonsResponse>({
      functionName: 'getLessons',
      data: { studentId: 'moved-first' },
      idToken: adminUser.idToken,
    });
    const ids = (after.data?.lessons ?? []).map((l) => l.id);
    expect(ids.filter((id) => id === moving.id)).toHaveLength(1);
    expect(ids).toHaveLength(materialised.length);
  }, 60000);
});
