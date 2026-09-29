import { setFirestoreDoc } from '@maple/firebase/integration-test-utils';

/**
 * A student with teaching owed and nothing else, for the task-ordered student
 * management flows. Its own student, so the student-page spec's billing rows
 * and lesson counts are untouched. Invented, like every fixture here.
 */
export const OWED_STUDENT_ID = 'e2e-stu-owed';
export const OWED_STUDENT_NAME = 'Juniper Vale';
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
}
