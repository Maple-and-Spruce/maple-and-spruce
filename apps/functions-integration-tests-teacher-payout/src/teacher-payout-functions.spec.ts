import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  CreateInstructorRequest,
  CreateInstructorResponse,
  CreateInvoiceRequest,
  CreateLessonRequest,
  CreateLessonResponse,
  CreateStudentRequest,
  CreateStudentResponse,
  GetTeacherPayoutsRequest,
  GetTeacherPayoutsResponse,
  UpdateInvoiceRequest,
  UpdateLessonRequest,
} from '@maple/ts/firebase/api-types';

/**
 * End-to-end test: seed one private-pay student + one Hope student,
 * schedule lessons, render the Hope one, send + pay the private-pay
 * invoice, then call getTeacherPayouts for the current month. Verify
 * each teacher's aggregated total, per-line payout math, and substitute
 * attribution using the primaryTeacherAtCreateId snapshot.
 */

// Query window = the current calendar month. The aggregation gates paid
// invoices on `paidAt`, which the repository auto-stamps to `new Date()`
// when status transitions to 'paid' — there's no API to override it. So
// the only way to keep the assertion stable across wall-clock months is
// to keep the query window aligned with whenever the test actually runs.
// Lessons scheduledAt below are computed from this same `now` for the
// same reason.
const NOW = new Date();
const FROM = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));
const TO = new Date(
  Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1, 0, 23, 59, 59, 999),
);

function dayInCurrentMonth(day: number): Date {
  return new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), day, 15));
}

// #686: lessons must be attributed to a block. These helpers seed all-day
// catch-all blocks per teacher/weekday and resolve a lesson's block id, so the
// dynamic-date fixtures below satisfy enforcement without reshaping.
function etWeekday(d: Date): number {
  const short = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/New_York',
  }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

function blockFor(teacherId: string, d: Date): string {
  return `blk-${teacherId}-${etWeekday(d)}`;
}

async function seedAllDayBlocks(teacherId: string): Promise<void> {
  for (let dow = 0; dow < 7; dow++) {
    await setFirestoreDoc('lessonBlocks', `blk-${teacherId}-${dow}`, {
      teacherId,
      dayOfWeek: dow,
      startMinutes: 0,
      endMinutes: 1440,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

describe('getTeacherPayouts integration', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;
  let primaryTeacherId: string;
  let substituteTeacherId: string;
  let privateStudentId: string;
  let hopeStudentId: string;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdminUser = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password,
    );
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });

    // Two instructors. Primary gets flat $50/lesson, substitute gets 60%.
    const primary = await callFunction<
      CreateInstructorRequest,
      CreateInstructorResponse
    >({
      functionName: 'createInstructor',
      data: {
        name: 'Primary Teacher',
        email: 'primary@test.com',
        status: 'active',
        payRate: 5000,
        payRateType: 'flat',
      },
      idToken: adminUser.idToken,
    });
    primaryTeacherId = primary.data!.instructor.id;

    const substitute = await callFunction<
      CreateInstructorRequest,
      CreateInstructorResponse
    >({
      functionName: 'createInstructor',
      data: {
        name: 'Substitute Teacher',
        email: 'sub@test.com',
        status: 'active',
        payRate: 0.6,
        payRateType: 'percentage',
      },
      idToken: adminUser.idToken,
    });
    substituteTeacherId = substitute.data!.instructor.id;

    // Blocks so lessons created below satisfy #686 attribution.
    await seedAllDayBlocks(primaryTeacherId);
    await seedAllDayBlocks(substituteTeacherId);

    // Private-pay student
    const priv = await callFunction<
      CreateStudentRequest,
      CreateStudentResponse
    >({
      functionName: 'createStudent',
      data: {
        name: 'Private Kid',
        instrument: 'violin',
        isAdultStudent: false,
        primaryTeacherId,
        isHopeScholarship: false,
        primaryContactName: 'Parent',
        primaryContactEmail: 'parent@test.com',
        status: 'active',
      },
      idToken: adminUser.idToken,
    });
    privateStudentId = priv.data!.student.id;

    // Hope student — 45-min tier
    const hope = await callFunction<
      CreateStudentRequest,
      CreateStudentResponse
    >({
      functionName: 'createStudent',
      data: {
        name: 'Hope Kid',
        instrument: 'piano',
        isAdultStudent: false,
        primaryTeacherId,
        isHopeScholarship: true,
        registeredLessonLength: '45-min',
        primaryContactName: 'Hope Parent',
        primaryContactEmail: 'hope@test.com',
        status: 'active',
      },
      idToken: adminUser.idToken,
    });
    hopeStudentId = hope.data!.student.id;
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Auth guard', () => {
    it('rejects unauthenticated requests', async () => {
      const result = await callFunction<GetTeacherPayoutsRequest>({
        functionName: 'getTeacherPayouts',
        data: { from: FROM.toISOString(), to: TO.toISOString() },
      });
      expect(result.status).toBe(401);
    });

    it('rejects non-admin requests', async () => {
      const result = await callFunction<GetTeacherPayoutsRequest>({
        functionName: 'getTeacherPayouts',
        data: { from: FROM.toISOString(), to: TO.toISOString() },
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('Validation', () => {
    it('rejects invalid date strings', async () => {
      const result = await callFunction<GetTeacherPayoutsRequest>({
        functionName: 'getTeacherPayouts',
        data: { from: 'not-a-date', to: TO.toISOString() },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects when from is after to', async () => {
      const result = await callFunction<GetTeacherPayoutsRequest>({
        functionName: 'getTeacherPayouts',
        data: { from: TO.toISOString(), to: FROM.toISOString() },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Aggregation — mixed sources + substitute attribution', () => {
    it('aggregates paid private-pay + rendered Hope lessons per teacher', async () => {
      // 1. Schedule three lessons for private student, taught by primary,
      //    then invoice + mark paid.
      const privateLessonDates = [
        dayInCurrentMonth(7),
        dayInCurrentMonth(14),
        dayInCurrentMonth(21),
      ];
      const privateLessonIds: string[] = [];
      for (const scheduledAt of privateLessonDates) {
        const result = await callFunction<
          CreateLessonRequest,
          CreateLessonResponse
        >({
          functionName: 'createLesson',
          data: {
            studentId: privateStudentId,
            teacherId: primaryTeacherId,
            scheduledAt,
            durationMinutes: 30,
            status: 'scheduled',
            blockId: blockFor(primaryTeacherId, scheduledAt),
          },
          idToken: adminUser.idToken,
        });
        privateLessonIds.push(result.data!.lesson.id);
      }

      // 2. Schedule ONE of the private-pay lessons to be taught by substitute.
      //    This exercises asSubstitute flag.
      await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: {
          id: privateLessonIds[2],
          teacherId: substituteTeacherId,
        },
        idToken: adminUser.idToken,
      });

      // 3. Create + send + pay invoice covering all three.
      const invoice = await callFunction<
        CreateInvoiceRequest,
        { invoice: { id: string } }
      >({
        functionName: 'createInvoice',
        data: {
          studentId: privateStudentId,
          lineItems: privateLessonIds.map((lessonId, i) => ({
            id: `line-${i}`,
            description: `Lesson ${i + 1}`,
            lessonId,
            quantity: 1,
            unitAmountCents: 4000,
            subtotalCents: 4000,
          })),
        },
        idToken: adminUser.idToken,
      });
      const invoiceId = invoice.data!.invoice.id;

      await callFunction<UpdateInvoiceRequest>({
        functionName: 'updateInvoice',
        data: { id: invoiceId, status: 'sent' },
        idToken: adminUser.idToken,
      });
      await callFunction<UpdateInvoiceRequest>({
        functionName: 'updateInvoice',
        data: { id: invoiceId, status: 'paid' },
        idToken: adminUser.idToken,
      });

      // 4. Schedule two Hope lessons, render one, leave the other scheduled.
      const hopeRendered = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId: hopeStudentId,
          teacherId: primaryTeacherId,
          scheduledAt: dayInCurrentMonth(10),
          durationMinutes: 45,
          status: 'scheduled',
          blockId: blockFor(primaryTeacherId, dayInCurrentMonth(10)),
        },
        idToken: adminUser.idToken,
      });
      await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id: hopeRendered.data!.lesson.id, status: 'rendered' },
        idToken: adminUser.idToken,
      });

      const hopeScheduledOnly = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId: hopeStudentId,
          teacherId: primaryTeacherId,
          scheduledAt: dayInCurrentMonth(17),
          durationMinutes: 45,
          status: 'scheduled',
          blockId: blockFor(primaryTeacherId, dayInCurrentMonth(17)),
        },
        idToken: adminUser.idToken,
      });
      expect(hopeScheduledOnly.status).toBe(200);

      // 5. Query payouts for April.
      const result = await callFunction<
        GetTeacherPayoutsRequest,
        GetTeacherPayoutsResponse
      >({
        functionName: 'getTeacherPayouts',
        data: { from: FROM.toISOString(), to: TO.toISOString() },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);

      const payouts = result.data!.payouts;
      const primary = payouts.find((p) => p.teacherId === primaryTeacherId);
      const sub = payouts.find((p) => p.teacherId === substituteTeacherId);

      // Primary: 2 private-paid (flat $50 each = $100) + 1 Hope rendered
      //   (45-min tier = $58.75, percentage N/A for flat rate).
      //   Primary is FLAT — $50 per lesson regardless of base revenue.
      //   So total: 2 private @ $50 + 1 Hope @ $50 = $150 = 15000c
      expect(primary).toBeDefined();
      expect(primary!.totalOwedCents).toBe(15000);
      expect(primary!.lines).toHaveLength(3);
      // Hope-rendered should NOT be flagged asSubstitute (same teacher as primary).
      expect(
        primary!.lines.filter((l) => l.source === 'hope-rendered'),
      ).toHaveLength(1);

      // Substitute: 1 private-paid line @ 60% × $40 = $24 = 2400c
      //   flagged asSubstitute because teacherId !== snapshot primaryTeacherId.
      expect(sub).toBeDefined();
      expect(sub!.totalOwedCents).toBe(2400);
      expect(sub!.lines).toHaveLength(1);
      expect(sub!.lines[0].asSubstitute).toBe(true);
      expect(sub!.lines[0].source).toBe('private-paid');

      // Scheduled-but-not-rendered Hope lesson should NOT appear.
      const allLessonIds = [
        ...(primary?.lines ?? []),
        ...(sub?.lines ?? []),
      ].map((l) => l.lessonId);
      expect(allLessonIds).not.toContain(hopeScheduledOnly.data!.lesson.id);
    });

    it('filters by teacherId', async () => {
      const result = await callFunction<
        GetTeacherPayoutsRequest,
        GetTeacherPayoutsResponse
      >({
        functionName: 'getTeacherPayouts',
        data: {
          from: FROM.toISOString(),
          to: TO.toISOString(),
          teacherId: substituteTeacherId,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.payouts).toHaveLength(1);
      expect(result.data!.payouts[0].teacherId).toBe(substituteTeacherId);
    });

    it('returns empty payouts for a period with no activity', async () => {
      const result = await callFunction<
        GetTeacherPayoutsRequest,
        GetTeacherPayoutsResponse
      >({
        functionName: 'getTeacherPayouts',
        data: {
          from: new Date('2025-01-01T00:00:00Z').toISOString(),
          to: new Date('2025-01-31T23:59:59Z').toISOString(),
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.payouts).toEqual([]);
    });
  });
});
