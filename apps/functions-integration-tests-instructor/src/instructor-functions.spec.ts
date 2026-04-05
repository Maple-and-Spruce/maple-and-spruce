import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER, NON_ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CreateInstructorRequest,
  CreateInstructorResponse,
  GetInstructorsRequest,
  GetInstructorsResponse,
  GetInstructorRequest,
  GetInstructorResponse,
  UpdateInstructorRequest,
  UpdateInstructorResponse,
  DeleteInstructorRequest,
  DeleteInstructorResponse,
} from '@maple/ts/firebase/api-types';

const SAMPLE_INSTRUCTOR: CreateInstructorRequest = {
  name: 'Jane Weaver',
  email: 'jane@test.com',
  status: 'active',
  bio: 'Fiber artist with 15 years of experience in natural dyeing and weaving.',
  specialties: ['weaving', 'natural dyeing'],
  payRateType: 'flat',
  payRate: 7500, // $75 per class
};

describe('Instructor Functions', () => {
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
    it('should reject unauthenticated requests', async () => {
      const result = await callFunction<CreateInstructorRequest>({
        functionName: 'createInstructor',
        data: SAMPLE_INSTRUCTOR,
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<CreateInstructorRequest>({
        functionName: 'createInstructor',
        data: SAMPLE_INSTRUCTOR,
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('CRUD lifecycle', () => {
    let instructorId: string;

    it('should create an instructor', async () => {
      const result = await callFunction<
        CreateInstructorRequest,
        CreateInstructorResponse
      >({
        functionName: 'createInstructor',
        data: SAMPLE_INSTRUCTOR,
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.instructor).toBeDefined();
      expect(result.data?.instructor.name).toBe(SAMPLE_INSTRUCTOR.name);
      expect(result.data?.instructor.email).toBe(SAMPLE_INSTRUCTOR.email);
      expect(result.data?.instructor.bio).toBe(SAMPLE_INSTRUCTOR.bio);
      expect(result.data?.instructor.specialties).toEqual(
        SAMPLE_INSTRUCTOR.specialties
      );
      expect(result.data?.instructor.payRateType).toBe(
        SAMPLE_INSTRUCTOR.payRateType
      );
      expect(result.data?.instructor.payRate).toBe(SAMPLE_INSTRUCTOR.payRate);
      expect(result.data?.instructor.id).toBeDefined();

      instructorId = result.data!.instructor.id;
    });

    it('should get all instructors', async () => {
      const result = await callFunction<
        GetInstructorsRequest,
        GetInstructorsResponse
      >({
        functionName: 'getInstructors',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.instructors).toBeDefined();
      expect(result.data?.instructors.length).toBeGreaterThanOrEqual(1);
    });

    it('should get instructor by id', async () => {
      const result = await callFunction<
        GetInstructorRequest,
        GetInstructorResponse
      >({
        functionName: 'getInstructor',
        data: { id: instructorId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.instructor.id).toBe(instructorId);
      expect(result.data?.instructor.name).toBe(SAMPLE_INSTRUCTOR.name);
      expect(result.data?.instructor.bio).toBe(SAMPLE_INSTRUCTOR.bio);
    });

    it('should update an instructor', async () => {
      const result = await callFunction<
        UpdateInstructorRequest,
        UpdateInstructorResponse
      >({
        functionName: 'updateInstructor',
        data: {
          id: instructorId,
          name: 'Jane Master Weaver',
          specialties: ['weaving', 'natural dyeing', 'tapestry'],
          payRate: 10000, // $100 per class
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.instructor.name).toBe('Jane Master Weaver');
      expect(result.data?.instructor.specialties).toEqual([
        'weaving',
        'natural dyeing',
        'tapestry',
      ]);
      expect(result.data?.instructor.payRate).toBe(10000);
      // Unchanged fields should persist
      expect(result.data?.instructor.email).toBe(SAMPLE_INSTRUCTOR.email);
      expect(result.data?.instructor.bio).toBe(SAMPLE_INSTRUCTOR.bio);
    });

    it('should delete an instructor', async () => {
      const result = await callFunction<
        DeleteInstructorRequest,
        DeleteInstructorResponse
      >({
        functionName: 'deleteInstructor',
        data: { id: instructorId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);
    });

    it('should return not-found for deleted instructor', async () => {
      const result = await callFunction<GetInstructorRequest>({
        functionName: 'getInstructor',
        data: { id: instructorId },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('Validation', () => {
    it('should reject instructor with missing name', async () => {
      const result = await callFunction<Partial<CreateInstructorRequest>>({
        functionName: 'createInstructor',
        data: {
          email: 'no-name@test.com',
          status: 'active',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject instructor with invalid email', async () => {
      const result = await callFunction<Partial<CreateInstructorRequest>>({
        functionName: 'createInstructor',
        data: {
          name: 'Bad Email Instructor',
          email: 'not-an-email',
          status: 'active',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject percentage pay rate over 1', async () => {
      const result = await callFunction<Partial<CreateInstructorRequest>>({
        functionName: 'createInstructor',
        data: {
          name: 'Bad Rate Instructor',
          email: 'bad-rate@test.com',
          status: 'active',
          payRateType: 'percentage',
          payRate: 1.5,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });
});
