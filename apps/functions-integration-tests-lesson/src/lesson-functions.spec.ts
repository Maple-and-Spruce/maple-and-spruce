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
  UpdateLessonRequest,
  UpdateLessonResponse,
  DeleteLessonRequest,
  DeleteLessonResponse,
} from '@maple/ts/firebase/api-types';

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
});
