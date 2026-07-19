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
      NON_ADMIN_USER.password
    );

    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });

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
        'test-password-123!'
      );
      unlinkedTeacher = await createTestUser(
        'lesson-unlinked@test.maple',
        'test-password-123!'
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

      // A lesson taught by TEACHER_ID (NOT the linked teacher) — created by admin.
      const others = await callFunction<
        CreateLessonRequest,
        CreateLessonResponse
      >({
        functionName: 'createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-06-01T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
        },
        idToken: adminUser.idToken,
      });
      othersLessonId = others.data!.lesson.id;
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
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(new Date(result.data!.lesson.scheduledAt).toISOString()).toBe(
        '2026-05-02T16:00:00.000Z'
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
      const del = await callFunction<
        DeleteLessonRequest,
        DeleteLessonResponse
      >({
        functionName: 'deleteLesson',
        data: { id: lessonId },
        idToken: adminUser.idToken,
      });
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
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.lessons.length).toBe(4);
      expect(result.data?.seriesId).toBeTruthy();
      seriesId = result.data!.seriesId;
      seriesLessonIds = result.data!.lessons.map((l) => l.id);

      // All share the same seriesId
      expect(
        result.data!.lessons.every((l) => l.seriesId === seriesId)
      ).toBe(true);
    });

    it('filters getLessons by seriesId', async () => {
      const result = await callFunction<
        GetLessonsRequest,
        GetLessonsResponse
      >({
        functionName: 'getLessons',
        data: { seriesId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.lessons.length).toBe(4);
      expect(
        result.data!.lessons.every((l) => l.seriesId === seriesId)
      ).toBe(true);
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

      const cancelledCount = list
        .data!.lessons.filter((l) => l.status === 'cancelled')
        .length;
      const scheduledCount = list
        .data!.lessons.filter((l) => l.status === 'scheduled')
        .length;
      expect(cancelledCount).toBe(1);
      expect(scheduledCount).toBe(3);
    });

    it('rejects a series with an empty scheduledAts list', async () => {
      const result = await callFunction<
        Partial<CreateLessonSeriesRequest>
      >({
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
      const result = await callFunction<
        GetLessonsRequest,
        GetLessonsResponse
      >({
        functionName: 'getLessons',
        data: { studentId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(
        result.data!.lessons.every((l) => l.studentId === studentId)
      ).toBe(true);
    });

    it('filters by status', async () => {
      const result = await callFunction<
        GetLessonsRequest,
        GetLessonsResponse
      >({
        functionName: 'getLessons',
        data: { status: 'cancelled' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(
        result.data!.lessons.every((l) => l.status === 'cancelled')
      ).toBe(true);
    });

    it('filters by date range', async () => {
      const result = await callFunction<
        GetLessonsRequest,
        GetLessonsResponse
      >({
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
          new Date('2026-06-05T00:00:00Z').getTime()
        );
        expect(t).toBeLessThanOrEqual(
          new Date('2026-06-20T23:59:59Z').getTime()
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
        },
        idToken: adminUser.idToken,
      });
      expect(created.status).toBe(200);
      roomLessonId = created.data!.lesson.id;

      await waitForTrigger();

      const windows = await getSpruceWindows();
      const window = windows.find(
        (w) => w.sourceRef === `lessons/${roomLessonId}`
      );
      expect(window).toBeDefined();
      expect(window!.type).toBe('lesson');
      expect(new Date(window!.start).toISOString()).toBe(
        SCHEDULED_AT.toISOString()
      );
      expect(new Date(window!.end).toISOString()).toBe(
        new Date(SCHEDULED_AT.getTime() + 30 * 60 * 1000).toISOString()
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
        (w) => w.sourceRef === `lessons/${roomLessonId}`
      );
      // Still exactly one window (stable deterministic ID), at the new time
      expect(matching.length).toBe(1);
      expect(new Date(matching[0].start).toISOString()).toBe(
        newTime.toISOString()
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
        windows.find((w) => w.sourceRef === `lessons/${roomLessonId}`)
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
      timeoutMs = 15000
    ) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const invoices = await getInvoicesFor(sid);
        const found = invoices.find((i) =>
          i.lineItems.some((l) => l.lessonId === lessonId)
        );
        if (found) return found;
        await new Promise((r) => setTimeout(r, 1000));
      }
      return undefined;
    }

    async function createRenderedLesson(sid: string): Promise<string> {
      const res = await callFunction<CreateLessonRequest, CreateLessonResponse>({
        functionName: 'createLesson',
        data: {
          studentId: sid,
          teacherId: TEACHER_ID,
          scheduledAt: new Date('2026-08-01T15:00:00Z'),
          durationMinutes: 30,
          status: 'scheduled',
        },
        idToken: adminUser.idToken,
      });
      const lessonId = res.data!.lesson.id;
      await callFunction<UpdateLessonRequest>({
        functionName: 'updateLesson',
        data: { id: lessonId, status: 'rendered' },
        idToken: adminUser.idToken,
      });
      return lessonId;
    }

    async function createAutoStudent(
      overrides: Partial<CreateStudentRequest>
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
        invoices.some((i) => i.lineItems.some((l) => l.lessonId === lessonId))
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
        i.lineItems.some((l) => l.lessonId === lessonId)
      );
      expect(forLesson).toHaveLength(1);
    });
  });
});
