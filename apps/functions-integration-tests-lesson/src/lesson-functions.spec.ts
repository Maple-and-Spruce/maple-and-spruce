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
  CreateStudentRequest,
  CreateStudentResponse,
  CreateLessonRequest,
  CreateLessonResponse,
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse,
  GetLessonsRequest,
  GetLessonsResponse,
  GetRoomScheduleRequest,
  GetRoomScheduleResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
  DeleteLessonRequest,
  DeleteLessonResponse,
  GetInvoicesRequest,
  GetInvoicesResponse,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  RecordInvoicePaymentRequest,
  RecordInvoicePaymentResponse,
  GetNeedsAttentionRequest,
  GetNeedsAttentionResponse,
  GetHopeQueueRequest,
  GetHopeQueueResponse,
  RecordHopeSubmissionsRequest,
  RecordHopeSubmissionsResponse,
  CreateLessonBlockRequest,
  CreateLessonBlockResponse,
  GetLessonBlocksRequest,
  GetLessonBlocksResponse,
  UpdateLessonBlockRequest,
  UpdateLessonBlockResponse,
  DeleteLessonBlockRequest,
  DeleteLessonBlockResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Wait for the onLessonWrite trigger to process. Firestore triggers in the
 * emulator are async — there's a brief delay between the write and the
 * trigger completing its work.
 */
function waitForTrigger(ms = 4000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TEACHER_ID = 'instructor-test-teacher';
const SUBSTITUTE_ID = 'instructor-test-sub';

/** Weekday (0=Sun..6=Sat) of an instant in the shop timezone — matches the
 *  server's lessonFitsBlock evaluation. */
function etWeekday(d: Date): number {
  const short = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/New_York',
  }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

/** Deterministic id of the seeded all-day catch-all block for a teacher on the
 *  weekday of `d` (see seedAllDayBlocks). Lets existing lesson fixtures satisfy
 *  the #686 block-attribution requirement without reshaping every case. */
function blockFor(teacherId: string, d: Date): string {
  return `blk-${teacherId}-${etWeekday(d)}`;
}

/** Seed one all-day (00:00–24:00) block per weekday for a teacher, so any
 *  lesson time on any weekday can be attributed to a block. */
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

const SAMPLE_STUDENT: CreateStudentRequest = {
  name: 'Test Student',
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: TEACHER_ID,
  isHopeScholarship: false,
  primaryContactName: 'Parent',
  primaryContactEmail: 'parent@test.com',
  status: 'active',
};

describe('Lesson Functions', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;
  let studentId: string;

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

    // #686: lessons must be attributed to a block. Seed all-day catch-all
    // blocks so the existing lesson fixtures below stay valid.
    await seedAllDayBlocks(TEACHER_ID);
    await seedAllDayBlocks(SUBSTITUTE_ID);

    // Seed one student so lessons have a real FK target
    const studentResult = await callFunction<
      CreateStudentRequest,
      CreateStudentResponse
    >({
      functionName: 'createStudent',
      data: SAMPLE_STUDENT,
      idToken: adminUser.idToken,
    });
    studentId = studentResult.data!.student.id;
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Auth guard', () => {
    it('rejects unauthenticated requests to createLesson', async () => {
      const result = await callFunction<CreateLessonRequest>({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-05-01T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
        },
      });
      expect(result.status).toBe(401);
    });

    it('rejects non-admin createLessonSeries', async () => {
      const result = await callFunction<CreateLessonSeriesRequest>({
        functionName: 'createLessonSeries',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          durationMinutes: 30,
          scheduledAts: [new Date('2026-05-01T15:00:00Z')],
        },
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });

    it('rejects non-admin updateLesson and deleteLesson', async () => {
      const upd = await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id: 'any', notes: 'sub' },
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(upd.status);

      const del = await callFunction<DeleteLessonRequest>({
        functionName: 'deleteLesson',
        data: { id: 'any' },
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(del.status);
    });
  });

  describe('Lesson-teacher ownership (#617 phase 2)', () => {
    // A lesson teacher = a portal user linked to an instructor record via
    // instructor.uid, with the lesson-teacher role. They may manage only
    // lessons whose teacherId is their linked instructor.
    const OWN_INSTRUCTOR_ID = 'instructor-owned-by-teacher';
    let teacherUser: TestUser;
    let unlinkedTeacher: TestUser;
    let ownLessonId: string;
    let othersLessonId: string;

    beforeAll(async () => {
      teacherUser = await createTestUser(
        'lesson-owner@test.maple',
        'test-password-123!',
      );
      unlinkedTeacher = await createTestUser(
        'lesson-unlinked@test.maple',
        'test-password-123!',
      );
      // Both hold the lesson-teacher role...
      await setFirestoreDoc('userRoles', teacherUser.uid, {
        roles: ['lesson-teacher'],
      });
      await setFirestoreDoc('userRoles', unlinkedTeacher.uid, {
        roles: ['lesson-teacher'],
      });
      // ...but only teacherUser is linked to an instructor record.
      await setFirestoreDoc('instructors', OWN_INSTRUCTOR_ID, {
        uid: teacherUser.uid,
        name: 'Owning Teacher',
        email: 'owning-teacher@test.maple',
        status: 'active',
      });
      await seedAllDayBlocks(OWN_INSTRUCTOR_ID);

      // A lesson taught by TEACHER_ID (NOT the linked teacher) — created by admin.
      const othersAt = new Date('2026-06-01T15:00:00Z');
      const others = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: othersAt,
          durationMinutes: 30,
          status: 'scheduled',
          blockId: blockFor(TEACHER_ID, othersAt),
        },
        idToken: adminUser.idToken,
      });
      othersLessonId = others.data!.lesson.id;
    });

    it('recordInvoicePayment (#631): teacher records on their own lesson, denied on others', async () => {
      // A lesson the linked teacher teaches + an invoice referencing it.
      const ownLesson = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: OWN_INSTRUCTOR_ID,
          scheduledAt: new Date('2026-08-05T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
          blockId: blockFor(
            OWN_INSTRUCTOR_ID,
            new Date('2026-08-05T15:00:00Z'),
          ),
        },
        idToken: adminUser.idToken,
      });
      const lessonId = ownLesson.data!.lesson.id;

      const created = await callFunction<
        CreateInvoiceRequest,
        CreateInvoiceResponse
      >({
        functionName: 'createInvoice',
        data: {
          studentId,
          status: 'sent',
          lineItems: [
            {
              id: 'l1',
              description: 'Lesson',
              lessonId,
              quantity: 1,
              unitAmountCents: 4000,
              subtotalCents: 4000,
            },
          ],
        },
        idToken: adminUser.idToken,
      });
      const invoiceId = created.data!.invoice.id;

      // The unlinked lesson-teacher (no instructor) is denied.
      const deniedUnlinked = await callFunction<RecordInvoicePaymentRequest>({
        functionName: 'recordInvoicePayment',
        data: { id: invoiceId, source: 'venmo-manual' },
        idToken: unlinkedTeacher.idToken,
      });
      expect([403, 500]).toContain(deniedUnlinked.status);

      // The teacher who teaches the lesson may record the payment.
      const allowed = await callFunction<
        RecordInvoicePaymentRequest,
        RecordInvoicePaymentResponse
      >({
        functionName: 'recordInvoicePayment',
        data: { id: invoiceId, source: 'venmo-manual' },
        idToken: teacherUser.idToken,
      });
      expect(allowed.status).toBe(200);
      expect(allowed.data!.invoice.status).toBe('paid');
      expect(allowed.data!.invoice.paymentRecord?.source).toBe('venmo-manual');
    });

    it('lets a linked lesson teacher create a lesson they teach', async () => {
      const result = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: OWN_INSTRUCTOR_ID,
          scheduledAt: new Date('2026-06-02T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
          blockId: blockFor(
            OWN_INSTRUCTOR_ID,
            new Date('2026-06-02T15:00:00Z'),
          ),
        },
        idToken: teacherUser.idToken,
      });
      expect(result.status).toBe(200);
      ownLessonId = result.data!.lesson.id;
    });

    it('denies creating a lesson assigned to a different teacher', async () => {
      const result = await callFunction<CreateLessonRequest>({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-06-03T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
        },
        idToken: teacherUser.idToken,
      });
      expect(result.status).toBe(403);
    });

    it('lets a linked lesson teacher update their own lesson', async () => {
      const result = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: { id: ownLessonId, notes: 'practiced scales' },
        idToken: teacherUser.idToken,
      });
      expect(result.status).toBe(200);
      expect(result.data?.lesson.notes).toBe('practiced scales');
    });

    it("denies updating another teacher's lesson", async () => {
      const result = await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id: othersLessonId, notes: 'not mine' },
        idToken: teacherUser.idToken,
      });
      expect(result.status).toBe(403);
    });

    it("denies deleting another teacher's lesson", async () => {
      const result = await callFunction<DeleteLessonRequest>({
        functionName: 'deleteLesson',
        data: { id: othersLessonId },
        idToken: teacherUser.idToken,
      });
      expect(result.status).toBe(403);
    });

    it('denies an unlinked lesson teacher (no instructor record) entirely', async () => {
      const result = await callFunction<CreateLessonRequest>({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: OWN_INSTRUCTOR_ID,
          scheduledAt: new Date('2026-06-04T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
        },
        idToken: unlinkedTeacher.idToken,
      });
      expect(result.status).toBe(403);
    });

    it('admin can still manage any lesson', async () => {
      const result = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: { id: ownLessonId, notes: 'admin override' },
        idToken: adminUser.idToken,
      });
      expect(result.status).toBe(200);
    });
  });

  describe('Single lesson CRUD', () => {
    let lessonId: string;

    it('creates a single first-lesson booking', async () => {
      const result = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-05-01T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
          notes: 'First lesson',
          blockId: blockFor(TEACHER_ID, new Date('2026-05-01T15:00:00Z')),
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.lesson.studentId).toBe(studentId);
      expect(result.data?.lesson.teacherId).toBe(TEACHER_ID);
      expect(result.data?.lesson.durationMinutes).toBe(30);
      expect(result.data?.lesson.status).toBe('scheduled');
      expect(result.data?.lesson.seriesId).toBeUndefined();
      // Snapshot the student's primary teacher at create time (#283 payout
      // attribution can't retroactively flip when Katie reassigns later).
      expect(result.data?.lesson.primaryTeacherAtCreateId).toBe(TEACHER_ID);
      lessonId = result.data!.lesson.id;
    });

    it('rejects createLesson for a non-existent student', async () => {
      const result = await callFunction<CreateLessonRequest>({
        functionName: 'createLesson',
        data: {
          studentId: 'nonexistent',
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-05-01T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
          blockId: blockFor(TEACHER_ID, new Date('2026-05-01T15:00:00Z')),
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('reschedules via updateLesson', async () => {
      const result = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: {
          id: lessonId,
          scheduledAt: new Date('2026-05-02T16:00:00Z'),
          // Moves to a different weekday (Sat) — must re-attribute to that
          // day's block (#686 enforces fit on reschedule).
          blockId: blockFor(TEACHER_ID, new Date('2026-05-02T16:00:00Z')),
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(new Date(result.data!.lesson.scheduledAt).toISOString()).toBe(
        '2026-05-02T16:00:00.000Z',
      );
    });

    it('assigns a substitute teacher via updateLesson', async () => {
      const result = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: { id: lessonId, teacherId: SUBSTITUTE_ID },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.lesson.teacherId).toBe(SUBSTITUTE_ID);
    });

    it('cancels a lesson via status update', async () => {
      const result = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: { id: lessonId, status: 'cancelled' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.lesson.status).toBe('cancelled');
    });

    it('hard-deletes a lesson', async () => {
      const del = await callFunction<DeleteLessonRequest, DeleteLessonResponse>(
        {
          functionName: 'deleteLesson',
          data: { id: lessonId },
          idToken: adminUser.idToken,
        },
      );
      expect(del.status).toBe(200);
      expect(del.data?.success).toBe(true);
    });

    it('rejects validation with an invalid duration', async () => {
      const result = await callFunction<Partial<CreateLessonRequest>>({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-05-01T15:00:00Z'),
          durationMinutes: 25,
          status: 'scheduled',
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Recurring series', () => {
    let seriesId: string;
    let seriesLessonIds: string[];

    it('creates a series atomically and returns shared seriesId', async () => {
      const scheduledAts = [
        new Date('2026-06-01T15:00:00Z'),
        new Date('2026-06-08T15:00:00Z'),
        new Date('2026-06-15T15:00:00Z'),
        new Date('2026-06-22T15:00:00Z'),
      ];

      const result = await callFunction<
        CreateLessonSeriesRequest,
        CreateLessonSeriesResponse
      >({
        functionName: 'createLessonSeries',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          durationMinutes: 45,
          scheduledAts,
          notes: 'Summer series',
          // A weekly series shares one weekday, so one block covers all dates.
          blockId: blockFor(TEACHER_ID, scheduledAts[0]),
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.lessons.length).toBe(4);
      expect(result.data?.seriesId).toBeTruthy();
      seriesId = result.data!.seriesId;
      seriesLessonIds = result.data!.lessons.map((l) => l.id);

      // All share the same seriesId
      expect(result.data!.lessons.every((l) => l.seriesId === seriesId)).toBe(
        true,
      );
    });

    it('filters getLessons by seriesId', async () => {
      const result = await callFunction<GetLessonsRequest, GetLessonsResponse>({
        functionName: 'getLessons',
        data: { seriesId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.lessons.length).toBe(4);
      expect(result.data!.lessons.every((l) => l.seriesId === seriesId)).toBe(
        true,
      );
    });

    it('allows cancelling one lesson in a series without affecting others', async () => {
      const cancelled = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: { id: seriesLessonIds[1], status: 'cancelled' },
        idToken: adminUser.idToken,
      });
      expect(cancelled.status).toBe(200);

      const list = await callFunction<GetLessonsRequest, GetLessonsResponse>({
        functionName: 'getLessons',
        data: { seriesId },
        idToken: adminUser.idToken,
      });

      const cancelledCount = list.data!.lessons.filter(
        (l) => l.status === 'cancelled',
      ).length;
      const scheduledCount = list.data!.lessons.filter(
        (l) => l.status === 'scheduled',
      ).length;
      expect(cancelledCount).toBe(1);
      expect(scheduledCount).toBe(3);
    });

    it('rejects a series with an empty scheduledAts list', async () => {
      const result = await callFunction<Partial<CreateLessonSeriesRequest>>({
        functionName: 'createLessonSeries',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          durationMinutes: 30,
          scheduledAts: [],
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Filters', () => {
    it('filters by studentId', async () => {
      const result = await callFunction<GetLessonsRequest, GetLessonsResponse>({
        functionName: 'getLessons',
        data: { studentId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.lessons.every((l) => l.studentId === studentId)).toBe(
        true,
      );
    });

    it('filters by status', async () => {
      const result = await callFunction<GetLessonsRequest, GetLessonsResponse>({
        functionName: 'getLessons',
        data: { status: 'cancelled' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.lessons.every((l) => l.status === 'cancelled')).toBe(
        true,
      );
    });

    it('filters by date range', async () => {
      const result = await callFunction<GetLessonsRequest, GetLessonsResponse>({
        functionName: 'getLessons',
        data: {
          from: new Date('2026-06-05T00:00:00Z').toISOString(),
          to: new Date('2026-06-20T23:59:59Z').toISOString(),
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      for (const lesson of result.data!.lessons) {
        const t = new Date(lesson.scheduledAt).getTime();
        expect(t).toBeGreaterThanOrEqual(
          new Date('2026-06-05T00:00:00Z').getTime(),
        );
        expect(t).toBeLessThanOrEqual(
          new Date('2026-06-20T23:59:59Z').getTime(),
        );
      }
    });
  });

  describe('Room schedule derivation (onLessonWrite + getRoomSchedule)', () => {
    const SCHEDULED_AT = new Date('2026-07-01T15:00:00Z');
    const DAY_START = '2026-07-01T00:00:00.000Z';
    const DAY_END = '2026-07-02T00:00:00.000Z';
    let roomLessonId: string;

    async function getSpruceWindows() {
      const result = await callFunction<
        GetRoomScheduleRequest,
        GetRoomScheduleResponse
      >({
        functionName: 'getRoomSchedule',
        data: { room: 'spruce', start: DAY_START, end: DAY_END },
        idToken: adminUser.idToken,
      });
      expect(result.status).toBe(200);
      return result.data!.windows;
    }

    it('derives a private Spruce Room busy window when a lesson is scheduled', async () => {
      const created = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: SCHEDULED_AT,
          durationMinutes: 30,
          status: 'scheduled',
          blockId: blockFor(TEACHER_ID, SCHEDULED_AT),
        },
        idToken: adminUser.idToken,
      });
      expect(created.status).toBe(200);
      roomLessonId = created.data!.lesson.id;

      await waitForTrigger();

      const windows = await getSpruceWindows();
      const window = windows.find(
        (w) => w.sourceRef === `lessons/${roomLessonId}`,
      );
      expect(window).toBeDefined();
      expect(window!.type).toBe('lesson');
      expect(new Date(window!.start).toISOString()).toBe(
        SCHEDULED_AT.toISOString(),
      );
      expect(new Date(window!.end).toISOString()).toBe(
        new Date(SCHEDULED_AT.getTime() + 30 * 60 * 1000).toISOString(),
      );
      // Sanitized: the room schedule must not expose the student
      expect(window!.title).toBe('Music Lesson');
    });

    it('rejects getRoomSchedule for non-admins and unknown rooms', async () => {
      const nonAdmin = await callFunction<GetRoomScheduleRequest>({
        functionName: 'getRoomSchedule',
        data: { room: 'spruce', start: DAY_START, end: DAY_END },
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(nonAdmin.status);

      const badRoom = await callFunction<Partial<GetRoomScheduleRequest>>({
        functionName: 'getRoomSchedule',
        data: { room: 'attic' as never, start: DAY_START, end: DAY_END },
        idToken: adminUser.idToken,
      });
      expect(badRoom.status).not.toBe(200);
    });

    it('moves the busy window when the lesson is rescheduled', async () => {
      const newTime = new Date('2026-07-01T18:00:00Z');
      const updated = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: { id: roomLessonId, scheduledAt: newTime },
        idToken: adminUser.idToken,
      });
      expect(updated.status).toBe(200);

      await waitForTrigger();

      const windows = await getSpruceWindows();
      const matching = windows.filter(
        (w) => w.sourceRef === `lessons/${roomLessonId}`,
      );
      // Still exactly one window (stable deterministic ID), at the new time
      expect(matching.length).toBe(1);
      expect(new Date(matching[0].start).toISOString()).toBe(
        newTime.toISOString(),
      );
    });

    it('frees the room when the lesson is cancelled', async () => {
      const cancelled = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: { id: roomLessonId, status: 'cancelled' },
        idToken: adminUser.idToken,
      });
      expect(cancelled.status).toBe(200);

      await waitForTrigger();

      const windows = await getSpruceWindows();
      expect(
        windows.find((w) => w.sourceRef === `lessons/${roomLessonId}`),
      ).toBeUndefined();
    });
  });

  describe('Auto-invoice on rendered (#629)', () => {
    async function getInvoicesFor(sid: string) {
      const res = await callFunction<GetInvoicesRequest, GetInvoicesResponse>({
        functionName: 'getInvoices',
        data: { studentId: sid },
        idToken: adminUser.idToken,
      });
      return res.data!.invoices;
    }

    // Poll rather than a fixed wait — the trigger chain (onLessonRenderedInvoice
    // → create invoice) is async and its latency varies in the emulator.
    async function pollForLessonInvoice(
      sid: string,
      lessonId: string,
      timeoutMs = 15000,
    ) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const invoices = await getInvoicesFor(sid);
        const found = invoices.find((i) =>
          i.lineItems.some((l) => l.lessonId === lessonId),
        );
        if (found) return found;
        await new Promise((r) => setTimeout(r, 1000));
      }
      return undefined;
    }

    /** Create a scheduled lesson, then move it into a terminal status. */
    async function createLessonWithStatus(
      sid: string,
      status: 'rendered' | 'no-show',
    ): Promise<string> {
      const res = await callFunction<CreateLessonRequest, CreateLessonResponse>(
        {
          functionName: 'createLesson',
          data: {
            studentId: sid,
            teacherId: TEACHER_ID,
            scheduledAt: new Date('2026-08-01T15:00:00Z'),
            durationMinutes: 30,
            status: 'scheduled',
            blockId: blockFor(TEACHER_ID, new Date('2026-08-01T15:00:00Z')),
          },
          idToken: adminUser.idToken,
        },
      );
      const lessonId = res.data!.lesson.id;
      await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id: lessonId, status },
        idToken: adminUser.idToken,
      });
      return lessonId;
    }

    const createRenderedLesson = (sid: string) =>
      createLessonWithStatus(sid, 'rendered');
    /** The teacher marks that nobody came. */
    const createNoShowLesson = (sid: string) =>
      createLessonWithStatus(sid, 'no-show');

    async function createAutoStudent(
      overrides: Partial<CreateStudentRequest>,
    ): Promise<string> {
      const res = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: { ...SAMPLE_STUDENT, autoInvoice: true, ...overrides },
        idToken: adminUser.idToken,
      });
      return res.data!.student.id;
    }

    it('auto-creates a sent invoice at the per-student override rate', async () => {
      const sid = await createAutoStudent({
        name: 'Override Kid',
        primaryContactEmail: 'override@test.com',
        lessonRateCents: 4125,
      });
      const lessonId = await createRenderedLesson(sid);

      const invoice = await pollForLessonInvoice(sid, lessonId);
      expect(invoice).toBeTruthy();
      expect(invoice?.status).toBe('sent');
      expect(invoice?.lineItems[0].unitAmountCents).toBe(4125);
    });

    it('prices from the admin-configured rate table when there is no override', async () => {
      // Seed the default rates config; student has no per-student rate.
      await setFirestoreDoc('appConfig', 'lessonRates', {
        rateByLength: { '30-min-full': 3900 },
      });
      const sid = await createAutoStudent({
        name: 'Config Rate Kid',
        primaryContactEmail: 'configrate@test.com',
        registeredLessonLength: '30-min-full',
      });
      const lessonId = await createRenderedLesson(sid);

      const invoice = await pollForLessonInvoice(sid, lessonId);
      expect(invoice).toBeTruthy();
      expect(invoice?.lineItems[0].unitAmountCents).toBe(3900);
    });

    it('does NOT auto-invoice a student without the autoInvoice flag', async () => {
      // SAMPLE_STUDENT (studentId) has autoInvoice unset.
      const lessonId = await createRenderedLesson(studentId);
      await waitForTrigger(6000);

      const invoices = await getInvoicesFor(studentId);
      expect(
        invoices.some((i) => i.lineItems.some((l) => l.lessonId === lessonId)),
      ).toBe(false);
    });

    it('is idempotent — re-rendering does not create a second invoice', async () => {
      const sid = await createAutoStudent({
        name: 'Idempotent Kid',
        primaryContactEmail: 'idem@test.com',
        lessonRateCents: 5000,
      });
      const lessonId = await createRenderedLesson(sid);
      await pollForLessonInvoice(sid, lessonId);

      // A no-op re-write of the already-rendered lesson must not re-invoice.
      await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id: lessonId, notes: 'touch' },
        idToken: adminUser.idToken,
      });
      await waitForTrigger(6000);

      const invoices = await getInvoicesFor(sid);
      const forLesson = invoices.filter((i) =>
        i.lineItems.some((l) => l.lessonId === lessonId),
      );
      expect(forLesson).toHaveLength(1);
    });

    // ── no-show billing (#796) ─────────────────────────────────────────────
    //
    // Money in two directions, decided by one trigger, so both are proven
    // against real emulators rather than only against mocked repositories:
    // a private-pay no-show that fails to invoice is lost revenue, and a Hope
    // no-show that produces a charge is a compliance problem.

    it('bills a private-pay no-show — the slot was held and the teacher was there', async () => {
      const sid = await createAutoStudent({
        name: 'No Show Kid',
        primaryContactEmail: 'noshow@test.com',
        lessonRateCents: 4125,
      });
      const lessonId = await createNoShowLesson(sid);

      const invoice = await pollForLessonInvoice(sid, lessonId);
      expect(invoice).toBeTruthy();
      expect(invoice?.status).toBe('sent');
      expect(invoice?.lineItems[0].unitAmountCents).toBe(4125);
      // And it says what it is for, or the family will dispute it.
      expect(invoice?.lineItems[0].description).toMatch(/missed lesson/i);
    });

    it('never bills a Hope Scholarship no-show — Hope pays only for services rendered', async () => {
      const sid = await createAutoStudent({
        name: 'Hope No Show Kid',
        primaryContactEmail: 'hopenoshow@test.com',
        isHopeScholarship: true,
        lessonRateCents: 4125,
      });
      const lessonId = await createNoShowLesson(sid);
      await waitForTrigger(6000);

      const invoices = await getInvoicesFor(sid);
      expect(
        invoices.some((i) => i.lineItems.some((l) => l.lessonId === lessonId)),
      ).toBe(false);
    });

    it('does not bill twice when a rendered lesson is corrected to no-show', async () => {
      // Both statuses bill, so the trigger guards the EDGE. Without that,
      // fixing a mis-tap charges the family a second time.
      const sid = await createAutoStudent({
        name: 'Corrected Kid',
        primaryContactEmail: 'corrected@test.com',
        lessonRateCents: 4125,
      });
      const lessonId = await createRenderedLesson(sid);
      await pollForLessonInvoice(sid, lessonId);

      await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id: lessonId, status: 'no-show' },
        idToken: adminUser.idToken,
      });
      await waitForTrigger(6000);

      const invoices = await getInvoicesFor(sid);
      const forLesson = invoices.filter((i) =>
        i.lineItems.some((l) => l.lessonId === lessonId),
      );
      expect(forLesson).toHaveLength(1);
    });
  });

  describe('Hope Scholarship submissions (#799)', () => {
    let hopeStudentId: string;

    async function hopeLesson(status: 'rendered' | 'no-show'): Promise<string> {
      const created = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId: hopeStudentId,
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-07-07T19:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
          blockId: blockFor(TEACHER_ID, new Date('2026-07-07T19:00:00Z')),
        },
        idToken: adminUser.idToken,
      });
      const id = created.data!.lesson.id;
      await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id, status },
        idToken: adminUser.idToken,
      });
      return id;
    }

    beforeAll(async () => {
      const res = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: {
          ...SAMPLE_STUDENT,
          name: 'Hope Queue Kid',
          primaryContactEmail: 'hopequeue@test.com',
          isHopeScholarship: true,
          registeredLessonLength: '30-min-full',
        },
        idToken: adminUser.idToken,
      });
      hopeStudentId = res.data!.student.id;
    });

    it('lists a rendered Hope lesson as awaiting submission, priced at the tier rate', async () => {
      const lessonId = await hopeLesson('rendered');

      const queue = await callFunction<
        GetHopeQueueRequest,
        GetHopeQueueResponse
      >({
        functionName: 'getHopeQueue',
        data: { studentId: hopeStudentId },
        idToken: adminUser.idToken,
      });

      expect(queue.status).toBe(200);
      const found = queue.data!.entries.find((e) => e.lesson.id === lessonId);
      expect(found).toBeTruthy();
      expect(found?.rateCents).toBe(4125);
      expect(found?.submission).toBeUndefined();
      expect(queue.data!.totals.awaitingCount).toBeGreaterThan(0);
    });

    it('never lists a no-show — Hope pays only for services rendered', async () => {
      const lessonId = await hopeLesson('no-show');

      const queue = await callFunction<
        GetHopeQueueRequest,
        GetHopeQueueResponse
      >({
        functionName: 'getHopeQueue',
        data: { studentId: hopeStudentId },
        idToken: adminUser.idToken,
      });

      expect(
        queue.data!.entries.some((e) => e.lesson.id === lessonId),
      ).toBe(false);
    });

    it('refuses to claim a no-show even when asked directly', async () => {
      // The queue hiding it is not enough — the guard has to be on the write,
      // or a stale client could still claim public money for a lesson nobody
      // attended.
      const lessonId = await hopeLesson('no-show');

      const result = await callFunction<
        RecordHopeSubmissionsRequest,
        RecordHopeSubmissionsResponse
      >({
        functionName: 'recordHopeSubmissions',
        data: { lessonIds: [lessonId], status: 'submitted' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.recordedLessonIds).toEqual([]);
      expect(result.data!.skipped[0].reason).toMatch(/rendered/i);
    });

    it('records a claim, then marks it paid keeping the claimed rate', async () => {
      const lessonId = await hopeLesson('rendered');

      await callFunction<
        RecordHopeSubmissionsRequest,
        RecordHopeSubmissionsResponse
      >({
        functionName: 'recordHopeSubmissions',
        data: {
          lessonIds: [lessonId],
          status: 'submitted',
          emaReference: 'EMA-123',
        },
        idToken: adminUser.idToken,
      });

      await callFunction<
        RecordHopeSubmissionsRequest,
        RecordHopeSubmissionsResponse
      >({
        functionName: 'recordHopeSubmissions',
        data: { lessonIds: [lessonId], status: 'paid' },
        idToken: adminUser.idToken,
      });

      const queue = await callFunction<
        GetHopeQueueRequest,
        GetHopeQueueResponse
      >({
        functionName: 'getHopeQueue',
        data: { studentId: hopeStudentId },
        idToken: adminUser.idToken,
      });

      const found = queue.data!.entries.find((e) => e.lesson.id === lessonId);
      expect(found?.submission?.status).toBe('paid');
      expect(found?.submission?.rateCents).toBe(4125);
      expect(found?.submission?.emaReference).toBe('EMA-123');
    });

    it('backfills lessons that already happened, without a block', async () => {
      // Hope pays backwards, so teaching that predates the portal is still
      // claimable — but only if it can be recorded at all. Block attribution
      // is waived for a backfill; see isBackfillSeries.
      const past = [
        new Date('2026-06-02T19:00:00Z'),
        new Date('2026-06-09T19:00:00Z'),
      ];

      const result = await callFunction<
        CreateLessonSeriesRequest,
        CreateLessonSeriesResponse
      >({
        functionName: 'createLessonSeries',
        data: {
          studentId: hopeStudentId,
          teacherId: TEACHER_ID,
          durationMinutes: 30,
          scheduledAts: past,
          status: 'rendered',
          blockId: null,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.lessons).toHaveLength(2);
      expect(result.data!.lessons.every((l) => l.status === 'rendered')).toBe(
        true,
      );

      const queue = await callFunction<
        GetHopeQueueRequest,
        GetHopeQueueResponse
      >({
        functionName: 'getHopeQueue',
        data: { studentId: hopeStudentId },
        idToken: adminUser.idToken,
      });

      for (const lesson of result.data!.lessons) {
        expect(
          queue.data!.entries.some((e) => e.lesson.id === lesson.id),
        ).toBe(true);
      }
    });

    it('still refuses a FUTURE lesson series without a block', async () => {
      // The backfill exemption must not become a hole that lets new lessons
      // skip block attribution entirely.
      const result = await callFunction<
        CreateLessonSeriesRequest,
        CreateLessonSeriesResponse
      >({
        functionName: 'createLessonSeries',
        data: {
          studentId: hopeStudentId,
          teacherId: TEACHER_ID,
          durationMinutes: 30,
          scheduledAts: [new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)],
          blockId: null,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('Needs Attention (#807)', () => {
    // The classifiers are unit-tested. What this proves is the composition:
    // that the rows are actually derived from real Firestore state and land in
    // the right group. Assertions are on presence of specific rows rather than
    // exact totals, since earlier describes in this file seed their own data.

    async function attention(): Promise<GetNeedsAttentionResponse> {
      const res = await callFunction<
        GetNeedsAttentionRequest,
        GetNeedsAttentionResponse
      >({
        functionName: 'getNeedsAttention',
        data: {},
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(200);
      return res.data!;
    }

    function rowsOf(
      data: GetNeedsAttentionResponse,
      kind: string,
    ): Array<{ id: string; label: string }> {
      return data.groups.find((g) => g.kind === kind)?.rows ?? [];
    }

    it('flags an active private-pay student with automatic invoicing off', async () => {
      const created = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: {
          ...SAMPLE_STUDENT,
          name: 'Attention AutoInvoice Off',
          primaryContactEmail: 'attention-autoinvoice@test.com',
          autoInvoice: false,
        },
        idToken: adminUser.idToken,
      });
      const sid = created.data!.student.id;

      const data = await attention();
      const row = rowsOf(data, 'student-autoinvoice-off').find(
        (r) => r.id === sid,
      );
      expect(row).toBeTruthy();
      expect(data.total).toBeGreaterThan(0);
    });

    it('clears that row once the flag is turned on', async () => {
      // The panel's whole promise is that acting on a row removes it.
      const created = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: {
          ...SAMPLE_STUDENT,
          name: 'Attention Resolvable',
          primaryContactEmail: 'attention-resolvable@test.com',
          autoInvoice: false,
        },
        idToken: adminUser.idToken,
      });
      const sid = created.data!.student.id;

      expect(
        rowsOf(await attention(), 'student-autoinvoice-off').some(
          (r) => r.id === sid,
        ),
      ).toBe(true);

      await callFunction({
        functionName: 'updateStudent',
        data: { id: sid, autoInvoice: true },
        idToken: adminUser.idToken,
      });

      expect(
        rowsOf(await attention(), 'student-autoinvoice-off').some(
          (r) => r.id === sid,
        ),
      ).toBe(false);
    });

    it('never flags a Hope student for automatic invoicing', async () => {
      // createInvoice refuses Hope students outright, so the flag is meaningless
      // for them and the row would be noise no one can act on.
      const created = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: {
          ...SAMPLE_STUDENT,
          name: 'Attention Hope Student',
          primaryContactEmail: 'attention-hope@test.com',
          isHopeScholarship: true,
          autoInvoice: false,
        },
        idToken: adminUser.idToken,
      });
      const sid = created.data!.student.id;

      expect(
        rowsOf(await attention(), 'student-autoinvoice-off').some(
          (r) => r.id === sid,
        ),
      ).toBe(false);
    });

    it('flags a rendered lesson that never produced an invoice', async () => {
      const created = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: {
          ...SAMPLE_STUDENT,
          name: 'Attention Unbilled',
          primaryContactEmail: 'attention-unbilled@test.com',
          autoInvoice: false, // so nothing auto-invoices it
        },
        idToken: adminUser.idToken,
      });
      const sid = created.data!.student.id;

      const lesson = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId: sid,
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-08-01T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
          blockId: blockFor(TEACHER_ID, new Date('2026-08-01T15:00:00Z')),
        },
        idToken: adminUser.idToken,
      });
      const lessonId = lesson.data!.lesson.id;
      await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id: lessonId, status: 'rendered' },
        idToken: adminUser.idToken,
      });
      await waitForTrigger(3000);

      const rows = rowsOf(await attention(), 'lesson-unbilled');
      expect(rows.some((r) => r.id === lessonId)).toBe(true);
    });

    it('reports groups worst-first, and only non-empty ones', async () => {
      const data = await attention();
      expect(data.groups.every((g) => g.rows.length > 0)).toBe(true);
      const kinds = data.groups.map((g) => g.kind);
      const overdueAt = kinds.indexOf('invoice-overdue');
      const autoOffAt = kinds.indexOf('student-autoinvoice-off');
      if (overdueAt >= 0 && autoOffAt >= 0) {
        expect(overdueAt).toBeLessThan(autoOffAt);
      }
    });
  });

  describe('Lesson blocks (#686)', () => {
    const BLOCK_TEACHER_ID = 'instructor-block-test';
    // 2026-09-01 is a Tuesday; block covers 10:00–12:00 ET.
    const TUE = new Date('2026-09-01T15:00:00Z'); // 11:00 ET, inside
    const TUE_BEFORE = new Date('2026-09-01T13:00:00Z'); // 09:00 ET, outside
    let blockId: string;

    it('lets an admin create a block, denies a lesson-teacher', async () => {
      const denied = await callFunction<CreateLessonBlockRequest>({
        functionName: 'createLessonBlock',
        data: {
          teacherId: BLOCK_TEACHER_ID,
          dayOfWeek: 2,
          startMinutes: 600,
          endMinutes: 720,
        },
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(denied.status);

      const created = await callFunction<
        CreateLessonBlockRequest,
        CreateLessonBlockResponse
      >({
        functionName: 'createLessonBlock',
        data: {
          teacherId: BLOCK_TEACHER_ID,
          dayOfWeek: 2,
          startMinutes: 600,
          endMinutes: 720,
          label: 'Tue mornings',
        },
        idToken: adminUser.idToken,
      });
      expect(created.status).toBe(200);
      expect(created.data!.block.id).toBeTruthy();
      expect(created.data!.block.teacherId).toBe(BLOCK_TEACHER_ID);
      blockId = created.data!.block.id;
    });

    it('rejects an invalid block (end before start)', async () => {
      const result = await callFunction<CreateLessonBlockRequest>({
        functionName: 'createLessonBlock',
        data: {
          teacherId: BLOCK_TEACHER_ID,
          dayOfWeek: 2,
          startMinutes: 720,
          endMinutes: 600,
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('lists blocks for a teacher', async () => {
      const result = await callFunction<
        GetLessonBlocksRequest,
        GetLessonBlocksResponse
      >({
        functionName: 'getLessonBlocks',
        data: { teacherId: BLOCK_TEACHER_ID },
        idToken: adminUser.idToken,
      });
      expect(result.status).toBe(200);
      expect(result.data!.blocks.some((b) => b.id === blockId)).toBe(true);
      expect(
        result.data!.blocks.every((b) => b.teacherId === BLOCK_TEACHER_ID),
      ).toBe(true);
    });

    it('rejects a lesson with no block', async () => {
      const result = await callFunction<CreateLessonRequest>({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: BLOCK_TEACHER_ID,
          scheduledAt: TUE,
          durationMinutes: 30,
          status: 'scheduled',
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects a lesson outside the block window', async () => {
      const result = await callFunction<CreateLessonRequest>({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: BLOCK_TEACHER_ID,
          scheduledAt: TUE_BEFORE,
          durationMinutes: 30,
          status: 'scheduled',
          blockId,
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects a lesson attributed to another teacher’s block', async () => {
      const result = await callFunction<CreateLessonRequest>({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID, // block belongs to BLOCK_TEACHER_ID
          scheduledAt: TUE,
          durationMinutes: 30,
          status: 'scheduled',
          blockId,
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('accepts a lesson inside the block window', async () => {
      const result = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: BLOCK_TEACHER_ID,
          scheduledAt: TUE,
          durationMinutes: 30,
          status: 'scheduled',
          blockId,
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).toBe(200);
      expect(result.data!.lesson.blockId).toBe(blockId);
    });

    it('updates and deletes a block (admin only)', async () => {
      const updated = await callFunction<
        UpdateLessonBlockRequest,
        UpdateLessonBlockResponse
      >({
        functionName: 'updateLessonBlock',
        data: { id: blockId, label: 'Tue mornings (updated)' },
        idToken: adminUser.idToken,
      });
      expect(updated.status).toBe(200);
      expect(updated.data!.block.label).toBe('Tue mornings (updated)');

      const deleted = await callFunction<
        DeleteLessonBlockRequest,
        DeleteLessonBlockResponse
      >({
        functionName: 'deleteLessonBlock',
        data: { id: blockId },
        idToken: adminUser.idToken,
      });
      expect(deleted.status).toBe(200);
      expect(deleted.data!.success).toBe(true);
    });
  });
});
