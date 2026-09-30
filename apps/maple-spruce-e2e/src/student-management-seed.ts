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
/** A Hope student with two taught lessons and no EMA order yet. */
export const HOPE_BILLING_STUDENT_ID = 'e2e-stu-hope-billing';
const HOPE_PRODUCT_ID = 'e2e-hope-product';
/** Two past lessons never marked taught: history from before the app. */
export const HISTORY_STUDENT_ID = 'e2e-stu-history';
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

  await setFirestoreDoc('hopeProducts', HOPE_PRODUCT_ID, {
    emaProductId: '103772',
    name: 'Suzuki Violin Lesson - 30 min',
    priceCents: 3250,
    active: true,
    ...stamps,
  });
  await setFirestoreDoc('students', HOPE_BILLING_STUDENT_ID, {
    name: 'Marlow Quince',
    instrument: 'violin',
    isAdultStudent: false,
    isHopeScholarship: true,
    hopeProductId: HOPE_PRODUCT_ID,
    primaryTeacherId: TEACHER_ID,
    registeredLessonLength: '30-min-initial',
    primaryContactName: 'Test Parent',
    primaryContactEmail: 'marlow-parent@example.com',
    status: 'active',
    ...stamps,
  });
  // A retry starts with no order and nothing invoiced.
  for (const doc of await listFirestoreDocs('hopeOrders')) {
    if (doc.data['studentId'] === HOPE_BILLING_STUDENT_ID) {
      await deleteFirestoreDoc('hopeOrders', doc.id);
    }
  }
  for (const [id, days] of [
    ['e2e-hope-taught-1', -14],
    ['e2e-hope-taught-2', -7],
  ] as const) {
    await deleteFirestoreDoc('hopeSubmissions', id);
    await setFirestoreDoc('lessons', id, {
      studentId: HOPE_BILLING_STUDENT_ID,
      teacherId: TEACHER_ID,
      scheduledAt: at(days),
      durationMinutes: 30,
      status: 'rendered',
      ...stamps,
    });
  }

  await setFirestoreDoc('students', HISTORY_STUDENT_ID, {
    name: 'Sorrel Ashby',
    instrument: 'guitar',
    isAdultStudent: true,
    isHopeScholarship: false,
    primaryTeacherId: TEACHER_ID,
    registeredLessonLength: '30-min-full',
    primaryContactName: 'Sorrel Ashby',
    primaryContactEmail: 'sorrel@example.com',
    status: 'active',
    lessonRateCents: 4000,
    ...stamps,
  });
  // A retry starts from unpaid, unmarked history again.
  for (const doc of await listFirestoreDocs('invoices')) {
    if (doc.data['studentId'] === HISTORY_STUDENT_ID) {
      await deleteFirestoreDoc('invoices', doc.id);
    }
  }
  for (const [id, days] of [
    ['e2e-history-1', -21],
    ['e2e-history-2', -14],
  ] as const) {
    await setFirestoreDoc('lessons', id, {
      studentId: HISTORY_STUDENT_ID,
      teacherId: TEACHER_ID,
      scheduledAt: at(days),
      durationMinutes: 30,
      status: 'scheduled',
      ...stamps,
    });
  }
}
