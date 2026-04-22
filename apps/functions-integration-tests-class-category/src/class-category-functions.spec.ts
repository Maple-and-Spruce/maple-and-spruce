import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  deleteFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER, NON_ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CreateClassCategoryRequest,
  CreateClassCategoryResponse,
  GetClassCategoriesResponse,
  UpdateClassCategoryRequest,
  UpdateClassCategoryResponse,
  DeleteClassCategoryRequest,
  DeleteClassCategoryResponse,
  ReorderClassCategoriesRequest,
  ReorderClassCategoriesResponse,
} from '@maple/ts/firebase/api-types';

const SAMPLE_CATEGORY: CreateClassCategoryRequest = {
  name: 'Fiber Arts',
  description: 'Weaving, knitting, and other fiber crafts',
  order: 0,
};

describe('Class Category Functions', () => {
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
      const result = await callFunction<CreateClassCategoryRequest>({
        functionName: 'createClassCategory',
        data: SAMPLE_CATEGORY,
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<CreateClassCategoryRequest>({
        functionName: 'createClassCategory',
        data: SAMPLE_CATEGORY,
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('CRUD lifecycle', () => {
    let categoryId: string;

    it('should create a class category', async () => {
      const result = await callFunction<
        CreateClassCategoryRequest,
        CreateClassCategoryResponse
      >({
        functionName: 'createClassCategory',
        data: SAMPLE_CATEGORY,
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.category).toBeDefined();
      expect(result.data?.category.name).toBe(SAMPLE_CATEGORY.name);
      expect(result.data?.category.description).toBe(
        SAMPLE_CATEGORY.description
      );
      expect(result.data?.category.order).toBe(SAMPLE_CATEGORY.order);
      expect(result.data?.category.id).toBeDefined();

      categoryId = result.data!.category.id;
    });

    it('should get all class categories', async () => {
      const result = await callFunction<
        Record<string, never>,
        GetClassCategoriesResponse
      >({
        functionName: 'getClassCategories',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.categories).toBeDefined();
      expect(result.data?.categories.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject duplicate name', async () => {
      const result = await callFunction<CreateClassCategoryRequest>({
        functionName: 'createClassCategory',
        data: SAMPLE_CATEGORY,
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should update a class category', async () => {
      const result = await callFunction<
        UpdateClassCategoryRequest,
        UpdateClassCategoryResponse
      >({
        functionName: 'updateClassCategory',
        data: {
          id: categoryId,
          name: 'Fiber & Textile Arts',
          description: 'Updated description',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.category.name).toBe('Fiber & Textile Arts');
      expect(result.data?.category.description).toBe('Updated description');
    });

    it('should delete a class category', async () => {
      const result = await callFunction<
        DeleteClassCategoryRequest,
        DeleteClassCategoryResponse
      >({
        functionName: 'deleteClassCategory',
        data: { id: categoryId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);
    });
  });

  describe('Delete referential integrity', () => {
    it('should reject delete when classes use the category', async () => {
      // Create a category
      const createResult = await callFunction<
        CreateClassCategoryRequest,
        CreateClassCategoryResponse
      >({
        functionName: 'createClassCategory',
        data: { name: 'Glass Arts', order: 10 },
        idToken: adminUser.idToken,
      });

      const catId = createResult.data!.category.id;

      // Create a class referencing this category
      await setFirestoreDoc('classes', 'test-class-1', {
        name: 'Stained Glass Intro',
        categoryId: catId,
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Try to delete — should fail
      const deleteResult = await callFunction<DeleteClassCategoryRequest>({
        functionName: 'deleteClassCategory',
        data: { id: catId },
        idToken: adminUser.idToken,
      });

      expect(deleteResult.status).not.toBe(200);

      // Cleanup: remove the class so other tests aren't affected
      await deleteFirestoreDoc('classes', 'test-class-1');
      await callFunction<DeleteClassCategoryRequest>({
        functionName: 'deleteClassCategory',
        data: { id: catId },
        idToken: adminUser.idToken,
      });
    });
  });

  describe('Reorder', () => {
    let catAId: string;
    let catBId: string;
    let catCId: string;

    beforeAll(async () => {
      const [a, b, c] = await Promise.all([
        callFunction<CreateClassCategoryRequest, CreateClassCategoryResponse>({
          functionName: 'createClassCategory',
          data: { name: 'Ceramics', order: 0 },
          idToken: adminUser.idToken,
        }),
        callFunction<CreateClassCategoryRequest, CreateClassCategoryResponse>({
          functionName: 'createClassCategory',
          data: { name: 'Woodworking', order: 10 },
          idToken: adminUser.idToken,
        }),
        callFunction<CreateClassCategoryRequest, CreateClassCategoryResponse>({
          functionName: 'createClassCategory',
          data: { name: 'Paper Arts', order: 20 },
          idToken: adminUser.idToken,
        }),
      ]);

      catAId = a.data!.category.id;
      catBId = b.data!.category.id;
      catCId = c.data!.category.id;
    });

    afterAll(async () => {
      await Promise.all([
        callFunction<DeleteClassCategoryRequest>({
          functionName: 'deleteClassCategory',
          data: { id: catAId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteClassCategoryRequest>({
          functionName: 'deleteClassCategory',
          data: { id: catBId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteClassCategoryRequest>({
          functionName: 'deleteClassCategory',
          data: { id: catCId },
          idToken: adminUser.idToken,
        }),
      ]);
    });

    it('should reorder class categories', async () => {
      // Reverse the order: C, B, A
      const result = await callFunction<
        ReorderClassCategoriesRequest,
        ReorderClassCategoriesResponse
      >({
        functionName: 'reorderClassCategories',
        data: { categoryIds: [catCId, catBId, catAId] },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.categories).toBeDefined();

      const reordered = result.data!.categories;
      const catC = reordered.find((c) => c.id === catCId);
      const catA = reordered.find((c) => c.id === catAId);
      expect(catC?.order).toBeLessThan(catA?.order ?? Infinity);
    });
  });

  describe('Validation', () => {
    it('should reject category with missing name', async () => {
      const result = await callFunction<Partial<CreateClassCategoryRequest>>({
        functionName: 'createClassCategory',
        data: { description: 'No name', order: 0 },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject category with name too short', async () => {
      const result = await callFunction<Partial<CreateClassCategoryRequest>>({
        functionName: 'createClassCategory',
        data: { name: 'X', order: 0 },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });
});
