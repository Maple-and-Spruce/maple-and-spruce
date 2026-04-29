/**
 * Integration tests for duplicateClass.
 *
 * Locks in the user-facing contract: invoking the Copy admin action
 * produces a draft class with cloned fields, the original's image and
 * gallery URLs (no storage duplication), and a fresh `(Copy)` name —
 * leaving sessions and webflowItemId blank for Katie to set/regenerate.
 */
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
  CreateClassRequest,
  CreateClassResponse,
  CreateInstructorRequest,
  CreateInstructorResponse,
  DeleteClassRequest,
  DuplicateClassRequest,
  DuplicateClassResponse,
} from '@maple/ts/firebase/api-types';

function futureDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

const GALLERY_IMAGES = [
  {
    url: 'https://storage.example.com/duplicate-gallery-1.jpg',
    alt: 'Hands centering clay',
  },
  {
    url: 'https://storage.example.com/duplicate-gallery-2.jpg',
    alt: 'Bowls drying on a rack',
  },
];

const SOURCE_CLASS: CreateClassRequest = {
  name: 'Hand-Building Pottery',
  description: 'Coil and slab construction techniques.',
  shortDescription: 'No wheel required.',
  sessions: [{ dateTime: futureDate() }],
  durationMinutes: 90,
  capacity: 8,
  priceCents: 5500,
  skillLevel: 'beginner',
  status: 'draft',
  imageUrl: 'https://storage.example.com/duplicate-hero.jpg',
  galleryImages: GALLERY_IMAGES,
  location: 'Maple & Spruce Studio',
  materialsIncluded: 'Clay, glazes, firing',
  whatToBring: 'Apron and a curious mind',
  minimumAge: 12,
};

describe('duplicateClass', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;
  let sourceClassId: string;
  const createdClassIds: string[] = [];

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

    // Create an instructor so the source class can reference one.
    const instructorResult = await callFunction<
      CreateInstructorRequest,
      CreateInstructorResponse
    >({
      functionName: 'createInstructor',
      data: {
        name: 'Duplicate Test Instructor',
        email: 'duplicate-instructor@test.com',
        status: 'active',
        bio: 'Instructor for duplicate-class integration tests.',
        specialties: ['pottery'],
        payRateType: 'flat',
        payRate: 5000,
      },
      idToken: adminUser.idToken,
    });
    const instructorId = instructorResult.data!.instructor.id;

    // Seed a source class to duplicate.
    const sourceResult = await callFunction<
      CreateClassRequest,
      CreateClassResponse
    >({
      functionName: 'createClass',
      data: { ...SOURCE_CLASS, instructorId },
      idToken: adminUser.idToken,
    });
    sourceClassId = sourceResult.data!.class.id;
    createdClassIds.push(sourceClassId);
  });

  afterAll(async () => {
    for (const id of createdClassIds) {
      await callFunction<DeleteClassRequest>({
        functionName: 'deleteClass',
        data: { id },
        idToken: adminUser.idToken,
      });
    }
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Auth guard', () => {
    it('should reject unauthenticated requests', async () => {
      const result = await callFunction<DuplicateClassRequest>({
        functionName: 'duplicateClass',
        data: { sourceClassId },
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<DuplicateClassRequest>({
        functionName: 'duplicateClass',
        data: { sourceClassId },
        idToken: nonAdminUser.idToken,
      });
      expect(result.status).toBe(403);
    });
  });

  describe('Domain guards', () => {
    it('should reject empty sourceClassId', async () => {
      const result = await callFunction<DuplicateClassRequest>({
        functionName: 'duplicateClass',
        data: { sourceClassId: '' },
        idToken: adminUser.idToken,
      });
      // Firebase callable HTTP errors don't map to specific 4xx codes
      // — match the project convention and assert non-success only.
      expect(result.status).not.toBe(200);
    });

    it('should return not-found for a non-existent source', async () => {
      const result = await callFunction<DuplicateClassRequest>({
        functionName: 'duplicateClass',
        data: { sourceClassId: 'class-does-not-exist' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Happy path', () => {
    it('clones the source class as a draft, suffixes the name, and shares image URLs', async () => {
      const result = await callFunction<
        DuplicateClassRequest,
        DuplicateClassResponse
      >({
        functionName: 'duplicateClass',
        data: { sourceClassId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      const copy = result.data!.class;
      createdClassIds.push(copy.id);

      // Fresh identity
      expect(copy.id).toBeDefined();
      expect(copy.id).not.toBe(sourceClassId);
      expect(copy.webflowItemId).toBeUndefined();

      // Marker fields
      expect(copy.name).toBe(`${SOURCE_CLASS.name} (Copy)`);
      expect(copy.status).toBe('draft');
      expect(copy.sessions).toEqual([]);

      // Cloned scalar fields
      expect(copy.description).toBe(SOURCE_CLASS.description);
      expect(copy.shortDescription).toBe(SOURCE_CLASS.shortDescription);
      expect(copy.durationMinutes).toBe(SOURCE_CLASS.durationMinutes);
      expect(copy.capacity).toBe(SOURCE_CLASS.capacity);
      expect(copy.priceCents).toBe(SOURCE_CLASS.priceCents);
      expect(copy.skillLevel).toBe(SOURCE_CLASS.skillLevel);
      expect(copy.location).toBe(SOURCE_CLASS.location);
      expect(copy.materialsIncluded).toBe(SOURCE_CLASS.materialsIncluded);
      expect(copy.whatToBring).toBe(SOURCE_CLASS.whatToBring);
      expect(copy.minimumAge).toBe(SOURCE_CLASS.minimumAge);

      // Image URLs are reused as-is (storage references shared, no duplication)
      expect(copy.imageUrl).toBe(SOURCE_CLASS.imageUrl);
      expect(copy.galleryImages).toEqual(GALLERY_IMAGES);
    });
  });
});
