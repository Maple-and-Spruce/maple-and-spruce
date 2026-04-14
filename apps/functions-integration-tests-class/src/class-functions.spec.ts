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
  CreateClassRequest,
  CreateClassResponse,
  GetClassesRequest,
  GetClassesResponse,
  GetClassRequest,
  GetClassResponse,
  UpdateClassRequest,
  UpdateClassResponse,
  DeleteClassRequest,
  DeleteClassResponse,
  GetPublicClassesRequest,
  GetPublicClassesResponse,
  GetPublicClassRequest,
  GetPublicClassResponse,
  CreateInstructorRequest,
  CreateInstructorResponse,
} from '@maple/ts/firebase/api-types';

/** A future date, 30 days from now */
function futureDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

const SAMPLE_CLASS: CreateClassRequest = {
  name: 'Intro to Pottery',
  description: 'Learn the basics of wheel throwing in this hands-on workshop.',
  dateTime: futureDate(),
  durationMinutes: 120,
  capacity: 10,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'draft',
};

describe('Class Functions', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;
  let instructorId: string;

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

    // Create an instructor for published class tests
    const instructorResult = await callFunction<
      CreateInstructorRequest,
      CreateInstructorResponse
    >({
      functionName: 'createInstructor',
      data: {
        name: 'Test Instructor',
        email: 'instructor@test.com',
        status: 'active',
        bio: 'Test instructor for class integration tests.',
        specialties: ['pottery'],
        payRateType: 'flat',
        payRate: 5000,
      },
      idToken: adminUser.idToken,
    });
    instructorId = instructorResult.data!.instructor.id;
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Auth guard', () => {
    it('should reject unauthenticated requests', async () => {
      const result = await callFunction<CreateClassRequest>({
        functionName: 'createClass',
        data: SAMPLE_CLASS,
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<CreateClassRequest>({
        functionName: 'createClass',
        data: SAMPLE_CLASS,
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('CRUD lifecycle', () => {
    let classId: string;

    it('should create a class', async () => {
      const result = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: SAMPLE_CLASS,
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.class).toBeDefined();
      expect(result.data?.class.name).toBe(SAMPLE_CLASS.name);
      expect(result.data?.class.description).toBe(SAMPLE_CLASS.description);
      expect(result.data?.class.durationMinutes).toBe(
        SAMPLE_CLASS.durationMinutes
      );
      expect(result.data?.class.capacity).toBe(SAMPLE_CLASS.capacity);
      expect(result.data?.class.priceCents).toBe(SAMPLE_CLASS.priceCents);
      expect(result.data?.class.skillLevel).toBe(SAMPLE_CLASS.skillLevel);
      expect(result.data?.class.status).toBe(SAMPLE_CLASS.status);
      expect(result.data?.class.id).toBeDefined();

      classId = result.data!.class.id;
    });

    it('should get all classes', async () => {
      const result = await callFunction<GetClassesRequest, GetClassesResponse>({
        functionName: 'getClasses',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.classes).toBeDefined();
      expect(result.data?.classes.length).toBeGreaterThanOrEqual(1);
    });

    it('should get class by id', async () => {
      const result = await callFunction<GetClassRequest, GetClassResponse>({
        functionName: 'getClass',
        data: { id: classId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.class.id).toBe(classId);
      expect(result.data?.class.name).toBe(SAMPLE_CLASS.name);
    });

    it('should update a class', async () => {
      const result = await callFunction<
        UpdateClassRequest,
        UpdateClassResponse
      >({
        functionName: 'updateClass',
        data: {
          id: classId,
          name: 'Updated Pottery Workshop',
          capacity: 15,
          priceCents: 5500,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.class.name).toBe('Updated Pottery Workshop');
      expect(result.data?.class.capacity).toBe(15);
      expect(result.data?.class.priceCents).toBe(5500);
      // Unchanged fields should persist
      expect(result.data?.class.description).toBe(SAMPLE_CLASS.description);
      expect(result.data?.class.skillLevel).toBe(SAMPLE_CLASS.skillLevel);
    });

    it('should publish and appear in public classes', async () => {
      // Publish the class
      const publishResult = await callFunction<
        UpdateClassRequest,
        UpdateClassResponse
      >({
        functionName: 'updateClass',
        data: { id: classId, status: 'published', instructorId },
        idToken: adminUser.idToken,
      });
      expect(publishResult.status).toBe(200);
      expect(publishResult.data?.class.status).toBe('published');

      // Fetch public classes (no auth required)
      const publicResult = await callFunction<
        GetPublicClassesRequest,
        GetPublicClassesResponse
      >({
        functionName: 'getPublicClasses',
        data: {},
      });

      expect(publicResult.status).toBe(200);
      expect(publicResult.data?.classes).toBeDefined();

      const found = publicResult.data?.classes.find((c) => c.id === classId);
      expect(found).toBeDefined();
      expect(found?.name).toBe('Updated Pottery Workshop');
      expect(found?.spotsRemaining).toBe(15);
    });

    it('should get public class by id', async () => {
      const result = await callFunction<
        GetPublicClassRequest,
        GetPublicClassResponse
      >({
        functionName: 'getPublicClass',
        data: { id: classId },
      });

      expect(result.status).toBe(200);
      expect(result.data?.class.id).toBe(classId);
      expect(result.data?.class.name).toBe('Updated Pottery Workshop');
      expect(result.data?.class.spotsRemaining).toBeDefined();
    });

    it('should delete a class', async () => {
      const result = await callFunction<
        DeleteClassRequest,
        DeleteClassResponse
      >({
        functionName: 'deleteClass',
        data: { id: classId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);
    });

    it('should return not-found for deleted class', async () => {
      const result = await callFunction<GetClassRequest>({
        functionName: 'getClass',
        data: { id: classId },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('Filtering', () => {
    let draftClassId: string;
    let publishedClassId: string;

    beforeAll(async () => {
      const draftResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          ...SAMPLE_CLASS,
          name: 'Draft Weaving Class',
          status: 'draft',
        },
        idToken: adminUser.idToken,
      });
      draftClassId = draftResult.data!.class.id;

      const publishedResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          ...SAMPLE_CLASS,
          name: 'Published Knitting Class',
          status: 'published',
          instructorId,
        },
        idToken: adminUser.idToken,
      });
      publishedClassId = publishedResult.data!.class.id;
    });

    afterAll(async () => {
      await callFunction<DeleteClassRequest>({
        functionName: 'deleteClass',
        data: { id: draftClassId },
        idToken: adminUser.idToken,
      });
      await callFunction<DeleteClassRequest>({
        functionName: 'deleteClass',
        data: { id: publishedClassId },
        idToken: adminUser.idToken,
      });
    });

    it('should filter classes by status', async () => {
      const result = await callFunction<GetClassesRequest, GetClassesResponse>({
        functionName: 'getClasses',
        data: { status: 'draft' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      const names = result.data?.classes.map((c) => c.name) ?? [];
      expect(names).toContain('Draft Weaving Class');
      expect(names).not.toContain('Published Knitting Class');
    });

    it('should not include draft classes in public endpoint', async () => {
      const result = await callFunction<
        GetPublicClassesRequest,
        GetPublicClassesResponse
      >({
        functionName: 'getPublicClasses',
        data: {},
      });

      expect(result.status).toBe(200);
      const ids = result.data?.classes.map((c) => c.id) ?? [];
      expect(ids).not.toContain(draftClassId);
      expect(ids).toContain(publishedClassId);
    });
  });

  describe('Validation', () => {
    it('should reject class with missing name', async () => {
      const result = await callFunction<Partial<CreateClassRequest>>({
        functionName: 'createClass',
        data: {
          description:
            'A class with no name but a long enough description for validation.',
          dateTime: futureDate(),
          durationMinutes: 120,
          capacity: 10,
          priceCents: 4500,
          skillLevel: 'beginner',
          status: 'draft',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject class with short description', async () => {
      const result = await callFunction<Partial<CreateClassRequest>>({
        functionName: 'createClass',
        data: {
          name: 'Short Desc Class',
          description: 'Too short',
          dateTime: futureDate(),
          durationMinutes: 120,
          capacity: 10,
          priceCents: 4500,
          skillLevel: 'beginner',
          status: 'draft',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject class with invalid duration', async () => {
      const result = await callFunction<Partial<CreateClassRequest>>({
        functionName: 'createClass',
        data: {
          ...SAMPLE_CLASS,
          name: 'Bad Duration Class',
          durationMinutes: 10, // below 30 min minimum
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject class with capacity over 50', async () => {
      const result = await callFunction<Partial<CreateClassRequest>>({
        functionName: 'createClass',
        data: {
          ...SAMPLE_CLASS,
          name: 'Too Big Class',
          capacity: 100,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });
});
