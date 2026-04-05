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
  CreateCategoryRequest,
  CreateCategoryResponse,
  GetCategoriesResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
  DeleteCategoryRequest,
  DeleteCategoryResponse,
  ReorderCategoriesRequest,
  ReorderCategoriesResponse,
} from '@maple/ts/firebase/api-types';

const SAMPLE_CATEGORY: CreateCategoryRequest = {
  name: 'Fiber Arts',
  description: 'Weaving, knitting, and other fiber crafts',
  order: 0,
};

describe('Category Functions', () => {
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
      const result = await callFunction<CreateCategoryRequest>({
        functionName: 'createCategory',
        data: SAMPLE_CATEGORY,
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<CreateCategoryRequest>({
        functionName: 'createCategory',
        data: SAMPLE_CATEGORY,
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('CRUD lifecycle', () => {
    let categoryId: string;

    it('should create a category', async () => {
      const result = await callFunction<
        CreateCategoryRequest,
        CreateCategoryResponse
      >({
        functionName: 'createCategory',
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

    it('should get all categories', async () => {
      const result = await callFunction<
        Record<string, never>,
        GetCategoriesResponse
      >({
        functionName: 'getCategories',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.categories).toBeDefined();
      expect(result.data?.categories.length).toBeGreaterThanOrEqual(1);
    });

    it('should update a category', async () => {
      const result = await callFunction<
        UpdateCategoryRequest,
        UpdateCategoryResponse
      >({
        functionName: 'updateCategory',
        data: {
          id: categoryId,
          name: 'Fiber & Textile Arts',
          description: 'Updated description for fiber arts',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.category.name).toBe('Fiber & Textile Arts');
      expect(result.data?.category.description).toBe(
        'Updated description for fiber arts'
      );
      expect(result.data?.category.order).toBe(SAMPLE_CATEGORY.order);
    });

    it('should delete a category', async () => {
      const result = await callFunction<
        DeleteCategoryRequest,
        DeleteCategoryResponse
      >({
        functionName: 'deleteCategory',
        data: { id: categoryId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);
    });
  });

  describe('Reorder', () => {
    let catAId: string;
    let catBId: string;
    let catCId: string;

    beforeAll(async () => {
      const [a, b, c] = await Promise.all([
        callFunction<CreateCategoryRequest, CreateCategoryResponse>({
          functionName: 'createCategory',
          data: { name: 'Pottery', order: 0 },
          idToken: adminUser.idToken,
        }),
        callFunction<CreateCategoryRequest, CreateCategoryResponse>({
          functionName: 'createCategory',
          data: { name: 'Woodworking', order: 1 },
          idToken: adminUser.idToken,
        }),
        callFunction<CreateCategoryRequest, CreateCategoryResponse>({
          functionName: 'createCategory',
          data: { name: 'Painting', order: 2 },
          idToken: adminUser.idToken,
        }),
      ]);

      catAId = a.data!.category.id;
      catBId = b.data!.category.id;
      catCId = c.data!.category.id;
    });

    afterAll(async () => {
      await Promise.all([
        callFunction<DeleteCategoryRequest>({
          functionName: 'deleteCategory',
          data: { id: catAId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteCategoryRequest>({
          functionName: 'deleteCategory',
          data: { id: catBId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteCategoryRequest>({
          functionName: 'deleteCategory',
          data: { id: catCId },
          idToken: adminUser.idToken,
        }),
      ]);
    });

    it('should reorder categories', async () => {
      // Reverse the order: C, B, A
      const result = await callFunction<
        ReorderCategoriesRequest,
        ReorderCategoriesResponse
      >({
        functionName: 'reorderCategories',
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
      const result = await callFunction<Partial<CreateCategoryRequest>>({
        functionName: 'createCategory',
        data: {
          description: 'No name',
          order: 0,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject category with name too short', async () => {
      const result = await callFunction<Partial<CreateCategoryRequest>>({
        functionName: 'createCategory',
        data: {
          name: 'X',
          order: 0,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });
});
