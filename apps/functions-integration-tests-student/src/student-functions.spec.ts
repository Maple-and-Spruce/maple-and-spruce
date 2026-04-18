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
  GetStudentsRequest,
  GetStudentsResponse,
  GetStudentRequest,
  GetStudentResponse,
  UpdateStudentRequest,
  UpdateStudentResponse,
  DeleteStudentRequest,
  DeleteStudentResponse,
} from '@maple/ts/firebase/api-types';

const SAMPLE_STUDENT: CreateStudentRequest = {
  name: 'Olive Thompson',
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-sample',
  registeredLessonLength: '30-min-initial',
  isHopeScholarship: false,
  primaryContactName: 'Rita Thompson',
  primaryContactEmail: 'rita@test.com',
  primaryContactPhone: '555-111-2222',
  status: 'active',
  notes: 'Loves Twinkle variations.',
};

const HOPE_STUDENT: CreateStudentRequest = {
  name: 'Felix Rivera',
  instrument: 'piano',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-sample',
  registeredLessonLength: '45-min',
  isHopeScholarship: true,
  primaryContactName: 'Dana Rivera',
  primaryContactEmail: 'dana@test.com',
  status: 'active',
};

describe('Student Functions', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;

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
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Auth guard', () => {
    it('rejects unauthenticated requests', async () => {
      const result = await callFunction<CreateStudentRequest>({
        functionName: 'createStudent',
        data: SAMPLE_STUDENT,
      });
      expect(result.status).toBe(401);
    });

    it('rejects non-admin users for create', async () => {
      const result = await callFunction<CreateStudentRequest>({
        functionName: 'createStudent',
        data: SAMPLE_STUDENT,
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });

    it('rejects non-admin users for update', async () => {
      const result = await callFunction<UpdateStudentRequest>({
        functionName: 'updateStudent',
        data: { id: 'any', name: 'Nope' },
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });

    it('rejects non-admin users for delete', async () => {
      const result = await callFunction<DeleteStudentRequest>({
        functionName: 'deleteStudent',
        data: { id: 'any' },
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('CRUD lifecycle', () => {
    let studentId: string;

    it('creates a student', async () => {
      const result = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: SAMPLE_STUDENT,
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.student).toBeDefined();
      expect(result.data?.student.name).toBe(SAMPLE_STUDENT.name);
      expect(result.data?.student.instrument).toBe(SAMPLE_STUDENT.instrument);
      expect(result.data?.student.isAdultStudent).toBe(false);
      expect(result.data?.student.primaryTeacherId).toBe(
        SAMPLE_STUDENT.primaryTeacherId
      );
      expect(result.data?.student.isHopeScholarship).toBe(false);
      expect(result.data?.student.registeredLessonLength).toBe(
        SAMPLE_STUDENT.registeredLessonLength
      );
      expect(result.data?.student.primaryContactEmail).toBe(
        SAMPLE_STUDENT.primaryContactEmail
      );
      expect(result.data?.student.id).toBeDefined();

      studentId = result.data!.student.id;
    });

    it('lists all students', async () => {
      const result = await callFunction<
        GetStudentsRequest,
        GetStudentsResponse
      >({
        functionName: 'getStudents',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.students.length).toBeGreaterThanOrEqual(1);
    });

    it('gets a student by id', async () => {
      const result = await callFunction<GetStudentRequest, GetStudentResponse>({
        functionName: 'getStudent',
        data: { id: studentId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.student.id).toBe(studentId);
      expect(result.data?.student.name).toBe(SAMPLE_STUDENT.name);
    });

    it('updates a student', async () => {
      const result = await callFunction<
        UpdateStudentRequest,
        UpdateStudentResponse
      >({
        functionName: 'updateStudent',
        data: {
          id: studentId,
          registeredLessonLength: '45-min',
          notes: 'Advanced to 45-minute lessons.',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.student.registeredLessonLength).toBe('45-min');
      expect(result.data?.student.notes).toBe(
        'Advanced to 45-minute lessons.'
      );
      // Unchanged fields persist
      expect(result.data?.student.name).toBe(SAMPLE_STUDENT.name);
      expect(result.data?.student.primaryContactEmail).toBe(
        SAMPLE_STUDENT.primaryContactEmail
      );
    });

    it('deletes a student', async () => {
      const result = await callFunction<
        DeleteStudentRequest,
        DeleteStudentResponse
      >({
        functionName: 'deleteStudent',
        data: { id: studentId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);
    });

    it('returns not-found for a deleted student', async () => {
      const result = await callFunction<GetStudentRequest>({
        functionName: 'getStudent',
        data: { id: studentId },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('returns not-found when updating a missing student', async () => {
      const result = await callFunction<UpdateStudentRequest>({
        functionName: 'updateStudent',
        data: { id: 'nonexistent-id', name: 'Ghost' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('returns not-found when deleting a missing student', async () => {
      const result = await callFunction<DeleteStudentRequest>({
        functionName: 'deleteStudent',
        data: { id: 'nonexistent-id' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Filters', () => {
    let privateId: string;
    let hopeId: string;

    beforeAll(async () => {
      const privateResult = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: SAMPLE_STUDENT,
        idToken: adminUser.idToken,
      });
      privateId = privateResult.data!.student.id;

      const hopeResult = await callFunction<
        CreateStudentRequest,
        CreateStudentResponse
      >({
        functionName: 'createStudent',
        data: HOPE_STUDENT,
        idToken: adminUser.idToken,
      });
      hopeId = hopeResult.data!.student.id;
    });

    it('filters by Hope Scholarship flag', async () => {
      const result = await callFunction<
        GetStudentsRequest,
        GetStudentsResponse
      >({
        functionName: 'getStudents',
        data: { isHopeScholarship: true },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      const ids = result.data!.students.map((s) => s.id);
      expect(ids).toContain(hopeId);
      expect(ids).not.toContain(privateId);
    });

    it('filters by status', async () => {
      await callFunction<UpdateStudentRequest>({
        functionName: 'updateStudent',
        data: { id: privateId, status: 'inactive' },
        idToken: adminUser.idToken,
      });

      const result = await callFunction<
        GetStudentsRequest,
        GetStudentsResponse
      >({
        functionName: 'getStudents',
        data: { status: 'active' },
        idToken: adminUser.idToken,
      });

      const ids = result.data!.students.map((s) => s.id);
      expect(ids).not.toContain(privateId);
      expect(ids).toContain(hopeId);
    });

    it('filters by primaryTeacherId', async () => {
      const result = await callFunction<
        GetStudentsRequest,
        GetStudentsResponse
      >({
        functionName: 'getStudents',
        data: { primaryTeacherId: 'instructor-sample' },
        idToken: adminUser.idToken,
      });

      const ids = result.data!.students.map((s) => s.id);
      expect(ids).toContain(hopeId);
    });
  });

  describe('Validation', () => {
    it('rejects student with missing name', async () => {
      const result = await callFunction<Partial<CreateStudentRequest>>({
        functionName: 'createStudent',
        data: {
          instrument: 'violin',
          isAdultStudent: false,
          primaryTeacherId: 'instructor-sample',
          isHopeScholarship: false,
          primaryContactName: 'Parent',
          primaryContactEmail: 'parent@test.com',
          status: 'active',
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects student with invalid instrument', async () => {
      const result = await callFunction<Partial<CreateStudentRequest>>({
        functionName: 'createStudent',
        data: {
          ...SAMPLE_STUDENT,
          instrument: 'harpsichord' as 'violin',
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects student with malformed primaryContactEmail', async () => {
      const result = await callFunction<Partial<CreateStudentRequest>>({
        functionName: 'createStudent',
        data: {
          ...SAMPLE_STUDENT,
          primaryContactEmail: 'not-an-email',
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects student with missing primaryTeacherId', async () => {
      const result = await callFunction<Partial<CreateStudentRequest>>({
        functionName: 'createStudent',
        data: {
          ...SAMPLE_STUDENT,
          primaryTeacherId: '',
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });
});
