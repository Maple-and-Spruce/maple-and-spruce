import {
  deleteFirestoreDoc,
  listFirestoreDocs,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import {
  SCHEDULE_TIME_ZONE,
  weekdayIndexInZone,
  zonedDateKey,
  zonedWallClockToInstant,
} from '@maple/ts/domain';

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
/** A Hope student with a weekly time and nothing booked: book-only (#158). */
export const HOPE_BOOKING_STUDENT_ID = 'e2e-stu-hope-booking';
const BLOCK_ID = 'e2e-block-weekly';

/**
 * The studio's calendar date `days` from today, at `minutes` past midnight
 * there. Steps calendar days, not 24-hour blocks, so a clock change between
 * now and then keeps the wall-clock time (PATTERNS: Dates and Clock Changes).
 */
export function studioTime(now: Date, days: number, minutes: number): Date {
  const [year, month, day] = zonedDateKey(now, SCHEDULE_TIME_ZONE)
    .split('-')
    .map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return zonedWallClockToInstant(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    minutes,
    SCHEDULE_TIME_ZONE
  );
}

/** The two-ahead student's weekly time, and its hand-made lessons. */
export const TWO_AHEAD_START_MINUTES = 16 * 60;
/**
 * The Hope booking student's weekly time: its own hour, in the same room.
 * Sharing 4:00 PM with the two-ahead student made "Book 4 lessons" collide
 * with that student's booked lessons, a real room clash the server refuses.
 */
export const HOPE_BOOKING_START_MINUTES = 17 * 60;
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
  // The weekly times below sit on the weekday eight days out (so tomorrow's
  // weekday): the first proposed date is never today and never in the past.
  const slotDay = weekdayIndexInZone(studioTime(now, 8, 0), SCHEDULE_TIME_ZONE);
  await setFirestoreDoc('lessonBlocks', BLOCK_ID, {
    teacherId: TEACHER_ID,
    dayOfWeek: slotDay,
    startMinutes: 9 * 60,
    endMinutes: 20 * 60,
    ...stamps,
  });
  const weeklyTime = (studentId: string, startMinutes: number) => ({
    studentId,
    teacherId: TEACHER_ID,
    blockId: BLOCK_ID,
    dayOfWeek: slotDay,
    startMinutes,
    durationMinutes: 30,
    intervalWeeks: 1,
    room: 'spruce',
    startsOn: at(-30),
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
  // A weekly time, so the two booked lessons are topped up to four (#158).
  await setFirestoreDoc(
    'studentLessonSchedules',
    'e2e-sched-two-ahead',
    weeklyTime(TWO_AHEAD_STUDENT_ID, TWO_AHEAD_START_MINUTES)
  );
  // A retry must start from two again, so clear any this spec already added.
  const lessons = await listFirestoreDocs('lessons');
  for (const doc of lessons) {
    if (doc.data['studentId'] === TWO_AHEAD_STUDENT_ID) {
      await deleteFirestoreDoc('lessons', doc.id);
    }
  }
  // On the weekly time, not at whatever time of day the run started: a lesson
  // that keeps "now"'s clock time lands on another student's slot for an
  // hour each afternoon (the 3:30-4:30 PM Eastern e2e failure).
  for (const [id, days] of [
    ['e2e-two-ahead-1', 8],
    ['e2e-two-ahead-2', 22],
  ] as const) {
    await setFirestoreDoc('lessons', id, {
      studentId: TWO_AHEAD_STUDENT_ID,
      teacherId: TEACHER_ID,
      scheduledAt: studioTime(now, days, TWO_AHEAD_START_MINUTES),
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

  await setFirestoreDoc('students', HOPE_BOOKING_STUDENT_ID, {
    name: 'Rowen Thistle',
    instrument: 'violin',
    isAdultStudent: false,
    isHopeScholarship: true,
    hopeProductId: HOPE_PRODUCT_ID,
    primaryTeacherId: TEACHER_ID,
    registeredLessonLength: '30-min-full',
    primaryContactName: 'Test Parent',
    primaryContactEmail: 'rowen-parent@example.com',
    status: 'active',
    ...stamps,
  });
  await setFirestoreDoc(
    'studentLessonSchedules',
    'e2e-sched-hope-booking',
    weeklyTime(HOPE_BOOKING_STUDENT_ID, HOPE_BOOKING_START_MINUTES)
  );
  // A retry starts with nothing booked.
  for (const doc of await listFirestoreDocs('lessons')) {
    if (doc.data['studentId'] === HOPE_BOOKING_STUDENT_ID) {
      await deleteFirestoreDoc('lessons', doc.id);
    }
  }
}
