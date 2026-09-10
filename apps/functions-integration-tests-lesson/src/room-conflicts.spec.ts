/**
 * Two things cannot be in the room at once (#841).
 *
 * The room is the real physical constraint — the reason overridden lesson
 * times get tracked at all is keeping the Spruce Room free — and until now
 * nothing enforced it. The one guard that existed is keyed `studentId|instant`,
 * so it stopped a student clashing with themselves and was blind to two
 * different people wanting the same hour.
 *
 * These run against real Firestore because the check reads calendar events
 * written by a TRIGGER (`onLessonWrite`), so the timing between the lesson
 * write and the event appearing is part of what is being tested.
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
  UpdateLessonRequest,
  UpdateLessonResponse,
} from '@maple/ts/firebase/api-types';

const TEACHER_ID = 'instructor-room-guard';
const OTHER_TEACHER = 'instructor-room-guard-2';
const BLOCK_ID = 'blk-room-guard';
const OTHER_BLOCK_ID = 'blk-room-guard-2';

/** Trigger latency: onLessonWrite writes the calendar event asynchronously. */
const waitForTrigger = (ms = 4000) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A Tuesday well clear of any other fixture's slots.
 *
 * The weekday is resolved BEFORE the hour is applied. Doing it the other way
 * round rolls the date over for any evening hour — `setUTCHours(20 + 4)` is
 * `setUTCHours(24)`, which silently becomes midnight the next day, and the
 * weekday is then computed from the wrong day.
 */
function tuesdayAt(hour: number, minute = 0): Date {
  const day = new Date();
  day.setUTCHours(12, 0, 0, 0);
  const delta = ((2 - day.getUTCDay() + 7) % 7) || 7;
  day.setUTCDate(day.getUTCDate() + delta + 21);

  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      hour + 4, // ET -> UTC; may exceed 24 and roll, which is correct here
      minute
    )
  );
}

describe('Room conflicts (#841)', () => {
  let adminUser: TestUser;

  const createLesson = (
    studentId: string,
    scheduledAt: Date,
    over: Partial<CreateLessonRequest> = {}
  ) =>
    callFunction<CreateLessonRequest, CreateLessonResponse>({
      functionName: 'createLesson',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        scheduledAt,
        durationMinutes: 60,
        status: 'scheduled',
        blockId: BLOCK_ID,
        room: 'spruce',
        ...over,
      } as CreateLessonRequest,
      idToken: adminUser.idToken,
    });

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

    for (const id of [TEACHER_ID, OTHER_TEACHER]) {
      await setFirestoreDoc('instructors', id, {
        name: `Teacher ${id}`,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    // One wide block per teacher, so nothing here is about block fit — each
    // teacher needs their OWN, or the ownership check fires before the room
    // check ever runs.
    for (const [blockId, teacherId] of [
      [BLOCK_ID, TEACHER_ID],
      [OTHER_BLOCK_ID, OTHER_TEACHER],
    ] as const) {
      await setFirestoreDoc('lessonBlocks', blockId, {
        teacherId,
        dayOfWeek: 2,
        startMinutes: 8 * 60,
        endMinutes: 22 * 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    for (const id of ['room-stu-a', 'room-stu-b']) {
      await setFirestoreDoc('students', id, {
        name: `Student ${id}`,
        instrument: 'violin',
        isAdultStudent: true,
        primaryTeacherId: TEACHER_ID,
        isHopeScholarship: false,
        primaryContactName: 'Contact',
        primaryContactEmail: `${id}@example.com`,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }, 30000);

  it('refuses a second student in the room at the same time', async () => {
    // The failure this exists for. Before #841 both writes succeeded and two
    // families turned up to one room.
    const at = tuesdayAt(9);

    const first = await createLesson('room-stu-a', at);
    expect(first.status).toBe(200);
    await waitForTrigger();

    const second = await createLesson('room-stu-b', at);

    expect(second.status).toBe(400);
    expect(JSON.stringify(second.error)).toMatch(/already taken/i);
  }, 60000);

  it('refuses a partial overlap, not just an exact one', async () => {
    const at = tuesdayAt(11);
    expect((await createLesson('room-stu-a', at)).status).toBe(200);
    await waitForTrigger();

    // Starts 30 minutes in.
    const overlapping = new Date(at.getTime() + 30 * 60_000);
    const second = await createLesson('room-stu-b', overlapping);

    expect(second.status).toBe(400);
  }, 60000);

  it('allows a lesson that starts exactly when the last one ends', async () => {
    // Back-to-back is the normal shape of a teaching day; refusing it would
    // make the guard useless.
    const at = tuesdayAt(13);
    expect((await createLesson('room-stu-a', at)).status).toBe(200);
    await waitForTrigger();

    const after = new Date(at.getTime() + 60 * 60_000);
    expect((await createLesson('room-stu-b', after)).status).toBe(200);
  }, 60000);

  it('refuses even when the second lesson is a DIFFERENT teacher', async () => {
    // One room. Two teachers cannot both use it, which is precisely what a
    // per-teacher check would have missed.
    const at = tuesdayAt(15);
    expect((await createLesson('room-stu-a', at)).status).toBe(200);
    await waitForTrigger();

    const other = await createLesson('room-stu-b', at, {
      teacherId: OTHER_TEACHER,
      blockId: OTHER_BLOCK_ID,
    });

    expect(other.status).toBe(400);
    expect(JSON.stringify(other.error)).toMatch(/already taken/i);
  }, 60000);

  it('allows a lesson with no room — it claims nothing', async () => {
    const at = tuesdayAt(17);
    expect((await createLesson('room-stu-a', at)).status).toBe(200);
    await waitForTrigger();

    const roomless = await createLesson('room-stu-b', at, { room: undefined });
    expect(roomless.status).toBe(200);
  }, 60000);

  it('lets a lesson be edited without clashing with itself', async () => {
    // The lesson's own calendar event already exists. Without the exclusion
    // every reschedule would be refused by the thing being rescheduled.
    const at = tuesdayAt(19);
    const created = await createLesson('room-stu-a', at);
    expect(created.status).toBe(200);
    await waitForTrigger();

    const edited = await callFunction<UpdateLessonRequest, UpdateLessonResponse>({
      functionName: 'updateLesson',
      data: { id: created.data!.lesson.id, notes: 'ran long' },
      idToken: adminUser.idToken,
    });

    expect(edited.status).toBe(200);
  }, 60000);

  it('frees the room when a lesson is cancelled', async () => {
    // A cancelled lesson has its calendar event removed, so the slot is
    // genuinely available again rather than held forever.
    const at = tuesdayAt(20);
    const created = await createLesson('room-stu-a', at);
    expect(created.status).toBe(200);
    await waitForTrigger();

    const cancelled = await callFunction<UpdateLessonRequest, UpdateLessonResponse>({
      functionName: 'updateLesson',
      data: { id: created.data!.lesson.id, status: 'cancelled' },
      idToken: adminUser.idToken,
    });
    expect(cancelled.status).toBe(200);
    // Deleting the event is a second trigger hop, so allow longer than a write.
    await waitForTrigger(8000);

    expect((await createLesson('room-stu-b', at)).status).toBe(200);
  }, 60000);
});
