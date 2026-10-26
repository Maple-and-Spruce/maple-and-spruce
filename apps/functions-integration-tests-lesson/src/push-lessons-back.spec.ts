/**
 * Push a lesson and every later one back a week, against real Firestore.
 *
 * The case this exists for: Katie is out on a Tuesday. Moving that lesson to
 * the next Tuesday is refused, because the student's own next lesson is in the
 * room then. Pushing back moves them together. The room check reads calendar
 * events written by the `onLessonWrite` trigger, so these run on the emulator
 * where that timing is real.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CreateLessonRequest,
  CreateLessonResponse,
  PushLessonsBackRequest,
  PushLessonsBackResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
} from '@maple/ts/firebase/api-types';
import { easternToUtc } from './eastern-time';

const TEACHER_ID = 'instructor-push-back';
const BLOCK_ID = 'blk-push-back-thu';

const waitForTrigger = (ms = 4000) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A Thursday `weeksOut` weeks past one well clear of today, at `hour` Eastern.
 * Thursday keeps these clear of the room-conflict suite's Tuesdays.
 */
function thursdayAt(weeksOut: number, hour: number): Date {
  const day = new Date();
  day.setUTCHours(12, 0, 0, 0);
  const delta = ((4 - day.getUTCDay() + 7) % 7) || 7;
  day.setUTCDate(day.getUTCDate() + delta + 21 + weeksOut * 7);
  return easternToUtc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour);
}

interface StoredLesson {
  scheduledAt?: { toDate?: () => Date } | string | Date;
}
interface StoredEvent {
  startDateTime?: { toDate?: () => Date } | string | Date;
}

function toDate(value: unknown): Date {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(value as string);
}

describe('Push lessons back a week', () => {
  let admin: TestUser;

  const createLesson = (studentId: string, scheduledAt: Date) =>
    callFunction<CreateLessonRequest, CreateLessonResponse>({
      functionName: 'lessons/createLesson',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        scheduledAt,
        durationMinutes: 60,
        status: 'scheduled',
        blockId: BLOCK_ID,
        room: 'spruce',
      } as CreateLessonRequest,
      idToken: admin.idToken,
    });

  const pushBack = (lessonId: string) =>
    callFunction<PushLessonsBackRequest, PushLessonsBackResponse>({
      functionName: 'lessons/pushLessonsBack',
      data: { lessonId },
      idToken: admin.idToken,
    });

  async function storedTime(lessonId: string): Promise<number> {
    const doc = (await getFirestoreDoc('lessons', lessonId)) as StoredLesson;
    return toDate(doc.scheduledAt).getTime();
  }

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setFirestoreDoc('instructors', TEACHER_ID, {
      name: 'Teacher push-back',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setFirestoreDoc('lessonBlocks', BLOCK_ID, {
      teacherId: TEACHER_ID,
      dayOfWeek: 4,
      startMinutes: 8 * 60,
      endMinutes: 22 * 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    for (const id of ['push-stu-a', 'push-stu-b']) {
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

  it("moves a lesson and the student's next one together, where moving one alone is refused", async () => {
    const first = (await createLesson('push-stu-a', thursdayAt(0, 12))).data!.lesson;
    const second = (await createLesson('push-stu-a', thursdayAt(1, 12))).data!.lesson;
    await waitForTrigger();

    // What Katie hit: the first lesson cannot be moved onto the second.
    const alone = await callFunction<UpdateLessonRequest, UpdateLessonResponse>({
      functionName: 'lessons/updateLesson',
      data: { id: first.id, scheduledAt: thursdayAt(1, 12) },
      idToken: admin.idToken,
    });
    expect(alone.status).toBe(400);
    expect(JSON.stringify(alone.error)).toMatch(/already taken/i);

    const pushed = await pushBack(first.id);
    expect(pushed.status).toBe(200);
    expect(pushed.data!.lessons.map((l) => l.id)).toEqual([first.id, second.id]);

    expect(await storedTime(first.id)).toBe(thursdayAt(1, 12).getTime());
    expect(await storedTime(second.id)).toBe(thursdayAt(2, 12).getTime());

    // The room bookings follow, so the old slots are free and the new ones held.
    await waitForTrigger();
    const event = (await getFirestoreDoc('calendarEvents', `lesson-${second.id}`)) as StoredEvent;
    expect(toDate(event.startDateTime).getTime()).toBe(thursdayAt(2, 12).getTime());
  }, 90000);

  it("refuses when another student has the room, and moves nothing", async () => {
    const mine = (await createLesson('push-stu-a', thursdayAt(0, 15))).data!.lesson;
    const theirs = await createLesson('push-stu-b', thursdayAt(1, 15));
    expect(theirs.status).toBe(200);
    await waitForTrigger();

    const pushed = await pushBack(mine.id);

    expect(pushed.status).toBe(400);
    expect(JSON.stringify(pushed.error)).toMatch(/already taken/i);
    expect(await storedTime(mine.id)).toBe(thursdayAt(0, 15).getTime());
  }, 90000);
});
