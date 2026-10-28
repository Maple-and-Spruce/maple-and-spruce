/**
 * My Week's typical week marks a weekly time lapsed when its student has had
 * no lesson in four weeks and has nothing booked — against real Firestore.
 *
 * Lessons are bought a few at a time, so a family that stops buying leaves a
 * weekly time behind that looks exactly like a standing slot. The contract:
 * a booked lesson ahead, or a lesson in the last four weeks, keeps it current;
 * an older lesson, or only cancelled ones, does not.
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
  GetMyWeekRequest,
  GetMyWeekResponse,
} from '@maple/ts/firebase/api-types';

const TEACHER_ID = 'instructor-my-week-lapsed';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('My Week: lapsed weekly times', () => {
  let admin: TestUser;

  async function student(id: string, dayOfWeek: number): Promise<void> {
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
    await setFirestoreDoc('studentLessonSchedules', `sched-${id}`, {
      studentId: id,
      teacherId: TEACHER_ID,
      blockId: 'blk-my-week-lapsed',
      dayOfWeek,
      startMinutes: 16 * 60,
      durationMinutes: 30,
      startsOn: new Date(Date.now() - 120 * DAY_MS),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async function lesson(
    id: string,
    studentId: string,
    daysFromNow: number,
    status = 'scheduled',
  ): Promise<void> {
    await setFirestoreDoc('lessons', id, {
      studentId,
      teacherId: TEACHER_ID,
      scheduledAt: new Date(Date.now() + daysFromNow * DAY_MS),
      durationMinutes: 30,
      status,
      room: 'spruce',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
    // The caller is this teacher: My Week is the signed-in teacher's own week.
    await setFirestoreDoc('instructors', TEACHER_ID, {
      name: 'Teacher my-week',
      uid: admin.uid,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await student('booked-ahead', 1); // only a lesson next week
    await lesson('les-booked-ahead', 'booked-ahead', 7);

    await student('taught-lately', 2); // a lesson two weeks ago, nothing ahead
    await lesson('les-taught-lately', 'taught-lately', -14, 'rendered');

    await student('stopped', 3); // last lesson six weeks ago
    await lesson('les-stopped', 'stopped', -42, 'rendered');

    await student('only-cancelled', 4); // recent, but cancelled
    await lesson('les-only-cancelled', 'only-cancelled', -7, 'cancelled');
  }, 30000);

  it('marks only the weekly times whose students have nothing recent or booked', async () => {
    const result = await callFunction<GetMyWeekRequest, GetMyWeekResponse>({
      functionName: 'lessons/getMyWeek',
      data: {},
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    const lapsedByStudent = Object.fromEntries(
      result
        .data!.standing.filter((s) => s.studentId)
        .map((s) => [s.studentId, s.lapsed === true]),
    );
    expect(lapsedByStudent).toEqual({
      'booked-ahead': false,
      'taught-lately': false,
      stopped: true,
      'only-cancelled': true,
    });
  }, 60000);
});
