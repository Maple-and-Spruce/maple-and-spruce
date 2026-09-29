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
  GetNeedsAttentionRequest,
  GetNeedsAttentionResponse,
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

  describe('Contractor readiness', () => {
    let teacherUser: TestUser;
    let contractorId: string;

    const allDone = {
      contractorAgreement: { signedOn: '2026-09-01', reference: 'Office binder' },
      backgroundCheck: { clearedOn: '2026-09-10' },
      paymentSetup: { completedOn: '2026-09-12', method: 'square-payroll' as const },
    };

    beforeAll(async () => {
      teacherUser = await createTestUser('readiness-teacher@test.com', 'password123');
      await setFirestoreDoc('userRoles', teacherUser.uid, {
        roles: ['lesson-teacher'],
      });
    });

    it('creates a contractor with a partial readiness record', async () => {
      const result = await callFunction<
        CreateInstructorRequest,
        CreateInstructorResponse
      >({
        functionName: 'createInstructor',
        data: {
          name: 'Robin Ashfield',
          email: 'robin.readiness@example.com',
          status: 'active',
          isContractor: true,
          readiness: { backgroundCheck: { clearedOn: '2026-09-10' } },
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.instructor.isContractor).toBe(true);
      expect(result.data?.instructor.readiness).toEqual({
        backgroundCheck: { clearedOn: '2026-09-10' },
      });
      contractorId = result.data!.instructor.id;
    });

    it('reads every item back after an update records them all', async () => {
      const update = await callFunction<
        UpdateInstructorRequest,
        UpdateInstructorResponse
      >({
        functionName: 'updateInstructor',
        data: { id: contractorId, readiness: allDone },
        idToken: adminUser.idToken,
      });
      expect(update.status).toBe(200);

      const read = await callFunction<GetInstructorRequest, GetInstructorResponse>({
        functionName: 'getInstructor',
        data: { id: contractorId },
        idToken: adminUser.idToken,
      });

      expect(read.status).toBe(200);
      expect(read.data?.instructor.isContractor).toBe(true);
      expect(read.data?.instructor.readiness).toEqual(allDone);
    });

    it('clears an item the update leaves out', async () => {
      const { contractorAgreement: _dropped, ...withoutAgreement } = allDone;

      const update = await callFunction<
        UpdateInstructorRequest,
        UpdateInstructorResponse
      >({
        functionName: 'updateInstructor',
        data: { id: contractorId, readiness: withoutAgreement },
        idToken: adminUser.idToken,
      });

      expect(update.status).toBe(200);
      expect(update.data?.instructor.readiness).toEqual(withoutAgreement);
    });

    it('leaves readiness untouched by an update that does not mention it', async () => {
      const update = await callFunction<
        UpdateInstructorRequest,
        UpdateInstructorResponse
      >({
        functionName: 'updateInstructor',
        data: { id: contractorId, bio: 'Teaches stained glass.' },
        idToken: adminUser.idToken,
      });

      expect(update.status).toBe(200);
      expect(update.data?.instructor.readiness?.backgroundCheck).toEqual({
        clearedOn: '2026-09-10',
      });
    });

    it('rejects an invalid date with invalid-argument', async () => {
      const result = await callFunction<UpdateInstructorRequest>({
        functionName: 'updateInstructor',
        data: {
          id: contractorId,
          readiness: { backgroundCheck: { clearedOn: '09/10/2026' } },
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(400);
    });

    describe('Needs attention', () => {
      const inDays = (n: number) =>
        new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

      async function attention(idToken: string): Promise<GetNeedsAttentionResponse> {
        const res = await callFunction<
          GetNeedsAttentionRequest,
          GetNeedsAttentionResponse
        >({ functionName: 'getNeedsAttention', data: {}, idToken });
        expect(res.status).toBe(200);
        return res.data!;
      }

      beforeAll(async () => {
        // Seeded directly: the class only needs to exist with this instructor
        // and a future session, and createClass would drag in Square.
        const sessionAt = inDays(5);
        await setFirestoreDoc('classes', 'readiness-upcoming-class', {
          name: 'Readiness Upcoming Class',
          description: 'A class taught by a contractor who is not cleared.',
          instructorId: contractorId,
          sessions: [{ dateTime: sessionAt }],
          firstSessionAt: sessionAt,
          durationMinutes: 120,
          capacity: 8,
          priceCents: 4500,
          skillLevel: 'all-levels',
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      it('flags a contractor who is teaching soon without being cleared', async () => {
        // By now the agreement was cleared by an earlier test.
        const data = await attention(adminUser.idToken);
        const group = data.groups.find((g) => g.kind === 'instructor-not-ready');

        expect(group).toBeDefined();
        const row = group!.rows.find((r) => r.id === contractorId);
        expect(row).toMatchObject({
          label: 'Robin Ashfield',
          href: `/instructors?edit=${contractorId}`,
          resolution: 'navigate',
        });
        expect(row!.detail).toContain('missing contractor agreement');
      });

      it('never shows the group to a lesson teacher', async () => {
        const data = await attention(teacherUser.idToken);

        expect(data.groups.map((g) => g.kind)).not.toContain('instructor-not-ready');
      });

      it('drops the row once every item is recorded', async () => {
        const update = await callFunction<UpdateInstructorRequest>({
          functionName: 'updateInstructor',
          data: { id: contractorId, readiness: allDone },
          idToken: adminUser.idToken,
        });
        expect(update.status).toBe(200);

        const data = await attention(adminUser.idToken);
        const rows =
          data.groups.find((g) => g.kind === 'instructor-not-ready')?.rows ?? [];
        expect(rows.map((r) => r.id)).not.toContain(contractorId);
      });
    });

    it('hides readiness from a lesson teacher listing instructors', async () => {
      const list = await callFunction<GetInstructorsRequest, GetInstructorsResponse>({
        functionName: 'getInstructors',
        idToken: teacherUser.idToken,
      });

      expect(list.status).toBe(200);
      const contractor = list.data?.instructors.find((i) => i.id === contractorId);
      expect(contractor).toBeDefined();
      expect(contractor).not.toHaveProperty('readiness');
      expect(contractor).not.toHaveProperty('isContractor');

      const single = await callFunction<GetInstructorRequest, GetInstructorResponse>({
        functionName: 'getInstructor',
        data: { id: contractorId },
        idToken: teacherUser.idToken,
      });

      expect(single.status).toBe(200);
      expect(single.data?.instructor).not.toHaveProperty('readiness');
    });
  });
});
