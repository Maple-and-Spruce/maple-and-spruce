/**
 * Deriving and widening blocks from scheduling, end to end (#835).
 *
 * Before this, Katie had to go build a LessonBlock by hand before she could
 * schedule anything into it — a dead end reached from the one screen where she
 * already knows exactly what the block should be. These prove the escape
 * hatches work against real Firestore, and, more importantly, that a derived
 * block never claims more availability than the thing it came from.
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
  CreateLessonRequest,
  CreateLessonResponse,
  CreateStudentLessonScheduleRequest,
  CreateStudentLessonScheduleResponse,
  GetLessonBlocksRequest,
  GetLessonBlocksResponse,
  UpdateStudentLessonScheduleRequest,
  UpdateStudentLessonScheduleResponse,
} from '@maple/ts/firebase/api-types';

const TEACHER_ID = 'instructor-derive-blocks';

/** The next Tuesday strictly after today, at `hour` ET. */
function nextTuesday(hour: number, weeksOut = 1): Date {
  const now = new Date();
  const d = new Date(now.getTime());
  d.setUTCHours(hour + 4, 0, 0, 0); // ET -> UTC (EDT); tests run mid-year
  const day = d.getUTCDay();
  const delta = ((2 - day + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta + (weeksOut - 1) * 7);
  return d;
}

function blocksFor(idToken: string) {
  return callFunction<GetLessonBlocksRequest, GetLessonBlocksResponse>({
    functionName: 'getLessonBlocks',
    data: { teacherId: TEACHER_ID },
    idToken,
  });
}

describe('Deriving lesson blocks from scheduling (#835)', () => {
  let adminUser: TestUser;
  let studentId: string;

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
      name: 'Derive Blocks Teacher',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    studentId = 'student-derive-blocks';
    await setFirestoreDoc('students', studentId, {
      name: 'Rowan',
      instrument: 'violin',
      isAdultStudent: false,
      primaryTeacherId: TEACHER_ID,
      isHopeScholarship: false,
      primaryContactName: 'Dana',
      primaryContactEmail: 'dana@test.com',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }, 30000);

  it('still refuses to schedule with no block and no strategy', async () => {
    // The #686 guardrail is intact — nothing here loosens it. Deriving a block
    // is something the caller asks for, never something that happens quietly.
    const result = await callFunction<CreateLessonRequest>({
      functionName: 'createLesson',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        scheduledAt: nextTuesday(16),
        durationMinutes: 30,
        status: 'scheduled',
      },
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(400);
    expect(JSON.stringify(result.error)).toMatch(/attributed to a block/i);
  }, 30000);

  it('derives a RECURRING block from a standing arrangement', async () => {
    // The primary case: Katie describes "Tuesdays 4pm, indefinitely" and the
    // block is fully derivable from that, so she never opens Lesson Blocks.
    const result = await callFunction<
      CreateStudentLessonScheduleRequest,
      CreateStudentLessonScheduleResponse
    >({
      functionName: 'createStudentLessonSchedule',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        blockId: '',
        dayOfWeek: 2,
        startMinutes: 16 * 60,
        durationMinutes: 30,
        startsOn: nextTuesday(16),
        blockStrategy: { mode: 'create' },
      } as CreateStudentLessonScheduleRequest,
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.schedule.blockId).toBeTruthy();
    expect(result.data?.lessonsCreated).toBeGreaterThan(0);

    const blocks = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
    const derived = blocks.find(
      (b) => b.id === result.data?.schedule.blockId
    );

    expect(derived).toMatchObject({
      teacherId: TEACHER_ID,
      dayOfWeek: 2,
      startMinutes: 16 * 60,
      endMinutes: 16 * 60 + 30,
    });
    // A standing arrangement IS standing availability, so this one recurs.
    expect(derived?.onDate).toBeUndefined();
  }, 60000);

  it('derives a ONE-OFF block from a single lesson', async () => {
    // A makeup lesson is not standing availability. If this created a weekly
    // block, Nathan's week view would sprout a phantom Thursday slot.
    const when = new Date(nextTuesday(19).getTime() + 2 * 86_400_000); // Thu 7pm

    const result = await callFunction<CreateLessonRequest, CreateLessonResponse>(
      {
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: when,
          durationMinutes: 45,
          status: 'scheduled',
          blockStrategy: { mode: 'create' },
        } as CreateLessonRequest,
        idToken: adminUser.idToken,
      }
    );

    expect(result.status).toBe(200);

    const blocks = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
    const derived = blocks.find((b) => b.id === result.data?.lesson.blockId);

    expect(derived?.onDate).toBeTruthy();
    expect(derived?.endMinutes).toBe(
      (derived?.startMinutes ?? 0) + 45
    );
  }, 60000);

  it('a one-off block does not cover the same weekday next week', async () => {
    // The whole reason one-off blocks exist. Scheduling the same time a week
    // later must not silently inherit last week's block.
    const when = new Date(nextTuesday(19).getTime() + 2 * 86_400_000);
    const nextWeek = new Date(when.getTime() + 7 * 86_400_000);

    const result = await callFunction<CreateLessonRequest>({
      functionName: 'createLesson',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        scheduledAt: nextWeek,
        durationMinutes: 45,
        status: 'scheduled',
        blockId: (await blocksFor(adminUser.idToken)).data?.blocks.find(
          (b) => b.onDate
        )?.id,
      } as CreateLessonRequest,
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(400);
    expect(JSON.stringify(result.error)).toMatch(/outside the selected block/i);
  }, 60000);

  it('widens the weekly block when asked, and only then', async () => {
    const blocks = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
    const weekly = blocks.find((b) => !b.onDate && b.dayOfWeek === 2);
    expect(weekly).toBeDefined();

    // 4:30–5:00 sits just past the derived 4:00–4:30 window.
    const when = nextTuesday(16, 2);
    when.setUTCMinutes(30);

    const result = await callFunction<CreateLessonRequest, CreateLessonResponse>(
      {
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: when,
          durationMinutes: 30,
          status: 'scheduled',
          blockStrategy: {
            mode: 'extend',
            blockId: weekly!.id,
            scope: 'weekly',
          },
        } as CreateLessonRequest,
        idToken: adminUser.idToken,
      }
    );

    expect(result.status).toBe(200);
    // Attributed to the same block, now wider — not to a new one.
    expect(result.data?.lesson.blockId).toBe(weekly!.id);

    const after = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
    expect(after.find((b) => b.id === weekly!.id)?.endMinutes).toBe(17 * 60);
  }, 60000);

  it('leaves the weekly block alone for "just this date"', async () => {
    const before = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
    const weekly = before.find((b) => !b.onDate && b.dayOfWeek === 2);
    const endBefore = weekly!.endMinutes;

    // 5:00–5:30, half an hour past the (now 4:00–5:00) weekly window.
    const when = nextTuesday(17, 3);

    const result = await callFunction<CreateLessonRequest, CreateLessonResponse>(
      {
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: when,
          durationMinutes: 30,
          status: 'scheduled',
          blockStrategy: {
            mode: 'extend',
            blockId: weekly!.id,
            scope: 'this-date',
          },
        } as CreateLessonRequest,
        idToken: adminUser.idToken,
      }
    );

    expect(result.status).toBe(200);

    const after = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
    // The weekly window is untouched: one long Tuesday must not widen every
    // Tuesday from here on.
    expect(after.find((b) => b.id === weekly!.id)?.endMinutes).toBe(endBefore);
    // And the lesson sits in a new one-off covering the wider window.
    const oneOff = after.find((b) => b.id === result.data?.lesson.blockId);
    expect(oneOff?.onDate).toBeTruthy();
    expect(oneOff?.endMinutes).toBe(17 * 60 + 30);
  }, 60000);

  it('refuses to widen a block more than an hour away', async () => {
    const blocks = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
    const weekly = blocks.find((b) => !b.onDate && b.dayOfWeek === 2);

    // 9pm — hours past the block. Without the window this would stretch it
    // across an evening nobody teaches.
    const result = await callFunction<CreateLessonRequest>({
      functionName: 'createLesson',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        scheduledAt: nextTuesday(21, 4),
        durationMinutes: 30,
        status: 'scheduled',
        blockStrategy: {
          mode: 'extend',
          blockId: weekly!.id,
          scope: 'weekly',
        },
      } as CreateLessonRequest,
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(400);
    expect(JSON.stringify(result.error)).toMatch(/no longer be extended/i);
  }, 60000);

  describe('a standing arrangement just past its block', () => {
    const scheduleStudentId = 'student-derive-blocks-standing';
    let scheduleId: string;

    beforeAll(async () => {
      await setFirestoreDoc('students', scheduleStudentId, {
        name: 'Test Student',
        instrument: 'fiddle',
        isAdultStudent: false,
        primaryTeacherId: TEACHER_ID,
        isHopeScholarship: false,
        primaryContactName: 'Test Parent',
        primaryContactEmail: 'parent@example.com',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }, 30000);

    it('is created by widening the weekly block', async () => {
      const before = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
      const weekly = before.find((b) => !b.onDate && b.dayOfWeek === 2);
      expect(weekly).toBeDefined();

      // Starts where the weekly window ends — the "Extend Tuesdays" case.
      const startMinutes = weekly!.endMinutes;
      const result = await callFunction<
        CreateStudentLessonScheduleRequest,
        CreateStudentLessonScheduleResponse
      >({
        functionName: 'createStudentLessonSchedule',
        data: {
          studentId: scheduleStudentId,
          teacherId: TEACHER_ID,
          blockId: '',
          dayOfWeek: 2,
          startMinutes,
          durationMinutes: 30,
          startsOn: nextTuesday(12),
          blockStrategy: {
            mode: 'extend',
            blockId: weekly!.id,
            scope: 'weekly',
          },
        } as CreateStudentLessonScheduleRequest,
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.schedule.blockId).toBe(weekly!.id);
      expect(result.data?.schedule.dayOfWeek).toBe(2);
      scheduleId = result.data!.schedule.id;

      const after = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
      expect(after.find((b) => b.id === weekly!.id)?.endMinutes).toBe(
        startMinutes + 30
      );
    }, 60000);

    it('is CHANGED to a later time by widening the block again', async () => {
      // The dialog offers the same way through when editing. The update used
      // to drop the choice and fail the fit check, so this never saved.
      const before = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
      const weekly = before.find((b) => !b.onDate && b.dayOfWeek === 2);
      const startMinutes = weekly!.endMinutes;

      const result = await callFunction<
        UpdateStudentLessonScheduleRequest,
        UpdateStudentLessonScheduleResponse
      >({
        functionName: 'updateStudentLessonSchedule',
        data: {
          id: scheduleId,
          blockId: '',
          dayOfWeek: 2,
          startMinutes,
          blockStrategy: {
            mode: 'extend',
            blockId: weekly!.id,
            scope: 'weekly',
          },
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.schedule.blockId).toBe(weekly!.id);
      expect(result.data?.schedule.startMinutes).toBe(startMinutes);
      // An instruction for the save, not a field of the arrangement.
      expect(result.data?.schedule).not.toHaveProperty('blockStrategy');

      const after = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
      expect(after.find((b) => b.id === weekly!.id)?.endMinutes).toBe(
        startMinutes + 30
      );
    }, 60000);

    it('still refuses a changed time outside the block with no choice made', async () => {
      const before = (await blocksFor(adminUser.idToken)).data?.blocks ?? [];
      const weekly = before.find((b) => !b.onDate && b.dayOfWeek === 2);

      const result = await callFunction<UpdateStudentLessonScheduleRequest>({
        functionName: 'updateStudentLessonSchedule',
        data: { id: scheduleId, startMinutes: weekly!.endMinutes },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(400);
      expect(JSON.stringify(result.error)).toMatch(/outside the selected block/i);
    }, 60000);
  });
});
