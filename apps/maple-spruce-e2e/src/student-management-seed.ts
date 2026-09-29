import {
  deleteFirestoreDoc,
  listFirestoreDocs,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';

/**
 * A student with teaching owed and nothing else, for the task-ordered student
 * management flows. Its own student, so the student-page spec's billing rows
 * and lesson counts are untouched. Invented, like every fixture here.
 */
export const OWED_STUDENT_ID = 'e2e-stu-owed';
export const OWED_STUDENT_NAME = 'Juniper Vale';
/** Two lessons ahead, made by hand, no weekly time: "the next 4" is short. */
export const TWO_AHEAD_STUDENT_ID = 'e2e-stu-two-ahead';
export const TWO_AHEAD_STUDENT_NAME = 'Linden Farrow';
const TEACHER_ID = 'e2e-teacher';
const DAY = 86_400_000;

export async function seedStudentManagement(
  now: Date = new Date()
): Promise<void> {
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const stamps = { createdAt: at(-30), updatedAt: at(-30) };

  await setFirestoreDoc('instructors', TEACHER_ID, {
    name: 'Test Teacher',
    email: 'teacher@example.com',
    status: 'active',
    ...stamps,
  });
  await setFirestoreDoc('students', OWED_STUDENT_ID, {
    name: OWED_STUDENT_NAME,
    instrument: 'cello',
    isAdultStudent: false,
    isHopeScholarship: false,
    primaryTeacherId: TEACHER_ID,
    registeredLessonLength: '30-min-full',
    primaryContactName: 'Test Parent',
    primaryContactEmail: 'juniper-parent@example.com',
    status: 'active',
    ...stamps,
  });
  // Taught, never charged or invoiced: what "Charge for past lessons" is for.
  await setFirestoreDoc('lessons', 'e2e-owed-taught', {
    studentId: OWED_STUDENT_ID,
    teacherId: TEACHER_ID,
    scheduledAt: at(-7),
    durationMinutes: 30,
    status: 'rendered',
    ...stamps,
  });

  await setFirestoreDoc('students', TWO_AHEAD_STUDENT_ID, {
    name: TWO_AHEAD_STUDENT_NAME,
    instrument: 'violin',
    isAdultStudent: false,
    isHopeScholarship: false,
    primaryTeacherId: TEACHER_ID,
    registeredLessonLength: '30-min-full',
    primaryContactName: 'Test Parent',
    primaryContactEmail: 'linden-parent@example.com',
    status: 'active',
    // A rate, so "the next 4" can be priced once it covers four.
    lessonRateCents: 4000,
    ...stamps,
  });
  // A retry must start from two again, so clear any this spec already added.
  const lessons = await listFirestoreDocs('lessons');
  for (const doc of lessons) {
    if (doc.data['studentId'] === TWO_AHEAD_STUDENT_ID) {
      await deleteFirestoreDoc('lessons', doc.id);
    }
  }
  for (const [id, days] of [
    ['e2e-two-ahead-1', 8],
    ['e2e-two-ahead-2', 22],
  ] as const) {
    await setFirestoreDoc('lessons', id, {
      studentId: TWO_AHEAD_STUDENT_ID,
      teacherId: TEACHER_ID,
      scheduledAt: at(days),
      durationMinutes: 30,
      status: 'scheduled',
      ...stamps,
    });
  }
}
