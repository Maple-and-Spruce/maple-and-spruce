import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  FirestoreTimestamp,
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
  GetProductResponse,
  GetProductsResponse,
} from '@maple/ts/firebase/api-types';

// Category routes on the products router (ADR-029, #68).
const GET_CATEGORIES = 'products/getCategories';
const CREATE_CATEGORY = 'products/createCategory';
const UPDATE_CATEGORY = 'products/updateCategory';
const DELETE_CATEGORY = 'products/deleteCategory';
const REORDER_CATEGORIES = 'products/reorderCategories';
// Product routes on the same router. Creating a product goes through Square
// (maple-square), so these tests seed one straight into Firestore.
const GET_PRODUCTS = 'products/getProducts';
const GET_PRODUCT = 'products/getProduct';
const DELETE_PRODUCT = 'products/deleteProduct';

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
        functionName: CREATE_CATEGORY,
        data: SAMPLE_CATEGORY,
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<CreateCategoryRequest>({
        functionName: CREATE_CATEGORY,
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
        functionName: CREATE_CATEGORY,
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
        functionName: GET_CATEGORIES,
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
        functionName: UPDATE_CATEGORY,
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
        functionName: DELETE_CATEGORY,
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
          functionName: CREATE_CATEGORY,
          data: { name: 'Pottery', order: 0 },
          idToken: adminUser.idToken,
        }),
        callFunction<CreateCategoryRequest, CreateCategoryResponse>({
          functionName: CREATE_CATEGORY,
          data: { name: 'Woodworking', order: 1 },
          idToken: adminUser.idToken,
        }),
        callFunction<CreateCategoryRequest, CreateCategoryResponse>({
          functionName: CREATE_CATEGORY,
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
          functionName: DELETE_CATEGORY,
          data: { id: catAId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteCategoryRequest>({
          functionName: DELETE_CATEGORY,
          data: { id: catBId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteCategoryRequest>({
          functionName: DELETE_CATEGORY,
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
        functionName: REORDER_CATEGORIES,
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
        functionName: CREATE_CATEGORY,
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
        functionName: CREATE_CATEGORY,
        data: {
          name: 'X',
          order: 0,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('products on the products router', () => {
    const PRODUCT_ID = 'test-product-1';
    let categoryId: string;

    beforeAll(async () => {
      const created = await callFunction<
        CreateCategoryRequest,
        CreateCategoryResponse
      >({
        functionName: CREATE_CATEGORY,
        data: { name: 'Pottery', order: 9 },
        idToken: adminUser.idToken,
      });
      expect(created.status).toBe(200);
      categoryId = created.data?.category.id ?? '';

      await setFirestoreDoc('products', PRODUCT_ID, {
        artistId: 'test-artist-1',
        categoryId,
        status: 'active',
        // findAll orders by createdAt, and Firestore leaves out documents
        // that lack the ordered field.
        createdAt: new FirestoreTimestamp(new Date()),
        squareCache: { name: 'Test Mug' },
        variants: [
          { id: 'v1', label: 'Regular', sku: 'TEST-MUG', priceCents: 2500, quantity: 3 },
        ],
      });
    });

    it('lists and reads the product', async () => {
      const list = await callFunction<Record<string, never>, GetProductsResponse>({
        functionName: GET_PRODUCTS,
        idToken: adminUser.idToken,
      });
      expect(list.status).toBe(200);
      expect(list.data?.products.map((p) => p.id)).toContain(PRODUCT_ID);

      const one = await callFunction<{ id: string }, GetProductResponse>({
        functionName: GET_PRODUCT,
        data: { id: PRODUCT_ID },
        idToken: adminUser.idToken,
      });
      expect(one.status).toBe(200);
      expect(one.data?.product.categoryId).toBe(categoryId);
    });

    it('refuses to delete a category a product still uses', async () => {
      const result = await callFunction<DeleteCategoryRequest>({
        functionName: DELETE_CATEGORY,
        data: { id: categoryId },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('turns away a user without a shop role', async () => {
      const result = await callFunction<{ id: string }>({
        functionName: DELETE_PRODUCT,
        data: { id: PRODUCT_ID },
        idToken: nonAdminUser.idToken,
      });
      expect(result.status).toBe(403);
    });

    it('deletes the product, after which it is gone and its category can go', async () => {
      const deleted = await callFunction<{ id: string }>({
        functionName: DELETE_PRODUCT,
        data: { id: PRODUCT_ID },
        idToken: adminUser.idToken,
      });
      expect(deleted.status).toBe(200);

      const gone = await callFunction<{ id: string }>({
        functionName: GET_PRODUCT,
        data: { id: PRODUCT_ID },
        idToken: adminUser.idToken,
      });
      // The request pipeline answers every error but permission-denied as 400.
      expect(gone.status).toBe(400);
      expect(JSON.stringify(gone.error)).toMatch(/not found/);

      const categoryDeleted = await callFunction<
        DeleteCategoryRequest,
        DeleteCategoryResponse
      >({
        functionName: DELETE_CATEGORY,
        data: { id: categoryId },
        idToken: adminUser.idToken,
      });
      expect(categoryDeleted.status).toBe(200);
    });
  });
});
