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
  CreateDiscountResponse,
  GetDiscountsRequest,
  GetDiscountsResponse,
  UpdateDiscountRequest,
  UpdateDiscountResponse,
  DeleteDiscountRequest,
  DeleteDiscountResponse,
  LookupDiscountRequest,
  LookupDiscountResponse,
} from '@maple/ts/firebase/api-types';
import type {
  PercentDiscountData,
  AmountDiscountData,
  AmountBeforeDateDiscountData,
} from '@maple/ts/domain';

type CreatePercentDiscount = Omit<PercentDiscountData, 'id' | 'createdAt' | 'updatedAt'>;
type CreateAmountDiscount = Omit<AmountDiscountData, 'id' | 'createdAt' | 'updatedAt'>;
type CreateAmountBeforeDateDiscount = Omit<AmountBeforeDateDiscountData, 'id' | 'createdAt' | 'updatedAt'>;

function futureCutoff(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d;
}

const PERCENT_DISCOUNT: CreatePercentDiscount = {
  code: 'SAVE20',
  type: 'percent',
  description: '20% off any class',
  status: 'active',
  percent: 20,
};

const AMOUNT_DISCOUNT: CreateAmountDiscount = {
  code: 'TENOFF',
  type: 'amount',
  description: '$10 off any class',
  status: 'active',
  amountCents: 1000,
};

const EARLY_BIRD_DISCOUNT: CreateAmountBeforeDateDiscount = {
  code: 'EARLYBIRD',
  type: 'amount-before-date',
  description: '$15 off if registered before cutoff',
  status: 'active',
  amountCents: 1500,
  cutoffDate: futureCutoff(),
};

describe('Discount Functions', () => {
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
      const result = await callFunction<CreatePercentDiscount>({
        functionName: 'createDiscount',
        data: PERCENT_DISCOUNT,
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<CreatePercentDiscount>({
        functionName: 'createDiscount',
        data: PERCENT_DISCOUNT,
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('CRUD lifecycle', () => {
    let discountId: string;

    it('should create a percent discount', async () => {
      const result = await callFunction<
        CreatePercentDiscount,
        CreateDiscountResponse
      >({
        functionName: 'createDiscount',
        data: PERCENT_DISCOUNT,
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount).toBeDefined();
      expect(result.data?.discount.code).toBe(PERCENT_DISCOUNT.code);
      expect(result.data?.discount.type).toBe('percent');
      expect(result.data?.discount.description).toBe(
        PERCENT_DISCOUNT.description
      );
      expect(result.data?.discount.status).toBe('active');
      expect(result.data?.discount.id).toBeDefined();

      discountId = result.data!.discount.id;
    });

    it('should get all discounts', async () => {
      const result = await callFunction<
        GetDiscountsRequest,
        GetDiscountsResponse
      >({
        functionName: 'getDiscounts',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.discounts).toBeDefined();
      expect(result.data?.discounts.length).toBeGreaterThanOrEqual(1);
    });

    it('should update a discount', async () => {
      const result = await callFunction<
        UpdateDiscountRequest,
        UpdateDiscountResponse
      >({
        functionName: 'updateDiscount',
        data: {
          id: discountId,
          description: '20% off summer classes',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount.description).toBe(
        '20% off summer classes'
      );
      // Unchanged fields should persist
      expect(result.data?.discount.code).toBe(PERCENT_DISCOUNT.code);
      expect(result.data?.discount.type).toBe('percent');
    });

    it('should delete a discount', async () => {
      const result = await callFunction<
        DeleteDiscountRequest,
        DeleteDiscountResponse
      >({
        functionName: 'deleteDiscount',
        data: { id: discountId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);
    });
  });

  describe('Discount types', () => {
    let percentId: string;
    let amountId: string;
    let earlyBirdId: string;

    beforeAll(async () => {
      const [percentRes, amountRes, earlyBirdRes] = await Promise.all([
        callFunction<CreatePercentDiscount, CreateDiscountResponse>({
          functionName: 'createDiscount',
          data: { ...PERCENT_DISCOUNT, code: 'PCT-TEST' },
          idToken: adminUser.idToken,
        }),
        callFunction<CreateAmountDiscount, CreateDiscountResponse>({
          functionName: 'createDiscount',
          data: AMOUNT_DISCOUNT,
          idToken: adminUser.idToken,
        }),
        callFunction<CreateAmountBeforeDateDiscount, CreateDiscountResponse>({
          functionName: 'createDiscount',
          data: EARLY_BIRD_DISCOUNT,
          idToken: adminUser.idToken,
        }),
      ]);

      percentId = percentRes.data!.discount.id;
      amountId = amountRes.data!.discount.id;
      earlyBirdId = earlyBirdRes.data!.discount.id;
    });

    afterAll(async () => {
      await Promise.all([
        callFunction<DeleteDiscountRequest>({
          functionName: 'deleteDiscount',
          data: { id: percentId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteDiscountRequest>({
          functionName: 'deleteDiscount',
          data: { id: amountId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteDiscountRequest>({
          functionName: 'deleteDiscount',
          data: { id: earlyBirdId },
          idToken: adminUser.idToken,
        }),
      ]);
    });

    it('should create all three discount types', async () => {
      const result = await callFunction<
        GetDiscountsRequest,
        GetDiscountsResponse
      >({
        functionName: 'getDiscounts',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      const types = result.data?.discounts.map((d) => d.type) ?? [];
      expect(types).toContain('percent');
      expect(types).toContain('amount');
      expect(types).toContain('amount-before-date');
    });
  });

  describe('Public lookup', () => {
    let activeDiscountId: string;
    let inactiveDiscountId: string;

    beforeAll(async () => {
      const [activeRes, inactiveRes] = await Promise.all([
        callFunction<CreatePercentDiscount, CreateDiscountResponse>({
          functionName: 'createDiscount',
          data: { ...PERCENT_DISCOUNT, code: 'LOOKUP-ACTIVE' },
          idToken: adminUser.idToken,
        }),
        callFunction<CreatePercentDiscount, CreateDiscountResponse>({
          functionName: 'createDiscount',
          data: {
            ...PERCENT_DISCOUNT,
            code: 'LOOKUP-INACTIVE',
            status: 'inactive',
          },
          idToken: adminUser.idToken,
        }),
      ]);

      activeDiscountId = activeRes.data!.discount.id;
      inactiveDiscountId = inactiveRes.data!.discount.id;
    });

    afterAll(async () => {
      await Promise.all([
        callFunction<DeleteDiscountRequest>({
          functionName: 'deleteDiscount',
          data: { id: activeDiscountId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteDiscountRequest>({
          functionName: 'deleteDiscount',
          data: { id: inactiveDiscountId },
          idToken: adminUser.idToken,
        }),
      ]);
    });

    it('should find active discount by code without auth', async () => {
      const result = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'LOOKUP-ACTIVE' },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount).toBeDefined();
      expect(result.data?.discount?.code).toBe('LOOKUP-ACTIVE');
    });

    it('should not return inactive discount on lookup', async () => {
      const result = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'LOOKUP-INACTIVE' },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount).toBeUndefined();
    });

    it('should return empty for non-existent code', async () => {
      const result = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'DOESNT-EXIST' },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount).toBeUndefined();
    });
  });

  describe('Validation', () => {
    it('should reject discount with missing code', async () => {
      const result = await callFunction({
        functionName: 'createDiscount',
        data: {
          type: 'percent',
          description: 'Missing code discount',
          status: 'active',
          percent: 10,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject percent discount with value over 100', async () => {
      const result = await callFunction({
        functionName: 'createDiscount',
        data: {
          code: 'BAD-PCT',
          type: 'percent',
          description: 'Invalid percent',
          status: 'active',
          percent: 150,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject code with invalid characters', async () => {
      const result = await callFunction({
        functionName: 'createDiscount',
        data: {
          code: 'BAD CODE!',
          type: 'percent',
          description: 'Code with spaces and special chars',
          status: 'active',
          percent: 10,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('Update validation', () => {
    let updateTargetId: string;
    let collisionTargetCode: string;

    beforeAll(async () => {
      const [targetRes, collisionRes] = await Promise.all([
        callFunction<CreatePercentDiscount, CreateDiscountResponse>({
          functionName: 'createDiscount',
          data: { ...PERCENT_DISCOUNT, code: 'UPD-TARGET' },
          idToken: adminUser.idToken,
        }),
        callFunction<CreatePercentDiscount, CreateDiscountResponse>({
          functionName: 'createDiscount',
          data: { ...PERCENT_DISCOUNT, code: 'UPD-TAKEN' },
          idToken: adminUser.idToken,
        }),
      ]);

      updateTargetId = targetRes.data!.discount.id;
      collisionTargetCode = collisionRes.data!.discount.code;
    });

    afterAll(async () => {
      const res = await callFunction<GetDiscountsRequest, GetDiscountsResponse>(
        {
          functionName: 'getDiscounts',
          idToken: adminUser.idToken,
        }
      );
      const toDelete = (res.data?.discounts ?? []).filter((d) =>
        ['UPD-TARGET', 'UPD-TAKEN', 'UPD-RENAMED'].includes(d.code)
      );
      await Promise.all(
        toDelete.map((d) =>
          callFunction<DeleteDiscountRequest>({
            functionName: 'deleteDiscount',
            data: { id: d.id },
            idToken: adminUser.idToken,
          })
        )
      );
    });

    it('should succeed when updating with valid partial payload', async () => {
      const result = await callFunction<
        UpdateDiscountRequest,
        UpdateDiscountResponse
      >({
        functionName: 'updateDiscount',
        data: {
          id: updateTargetId,
          description: 'Updated description via partial payload',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount.description).toBe(
        'Updated description via partial payload'
      );
    });

    it('should reject update with empty code', async () => {
      const result = await callFunction<UpdateDiscountRequest>({
        functionName: 'updateDiscount',
        data: {
          id: updateTargetId,
          code: '',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
      const errorMessage =
        typeof result.raw === 'object' &&
        result.raw !== null &&
        'error' in result.raw
          ? ((result.raw as { error: { message?: string } }).error?.message ??
            '')
          : '';
      expect(errorMessage).toMatch(/code/i);
    });

    it('should reject update with out-of-range percent', async () => {
      const result = await callFunction<UpdateDiscountRequest>({
        functionName: 'updateDiscount',
        data: {
          id: updateTargetId,
          percent: -5,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
      const errorMessage =
        typeof result.raw === 'object' &&
        result.raw !== null &&
        'error' in result.raw
          ? ((result.raw as { error: { message?: string } }).error?.message ??
            '')
          : '';
      expect(errorMessage).toMatch(/percent/i);
    });

    it('should reject update with invalid code characters', async () => {
      const result = await callFunction<UpdateDiscountRequest>({
        functionName: 'updateDiscount',
        data: {
          id: updateTargetId,
          code: 'BAD CODE!',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should still reject code collision (DB-level uniqueness)', async () => {
      const result = await callFunction<UpdateDiscountRequest>({
        functionName: 'updateDiscount',
        data: {
          id: updateTargetId,
          code: collisionTargetCode,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
      const errorMessage =
        typeof result.raw === 'object' &&
        result.raw !== null &&
        'error' in result.raw
          ? ((result.raw as { error: { message?: string } }).error?.message ??
            '')
          : '';
      expect(errorMessage).toMatch(/already exists/i);
    });

    it('should allow renaming to a fresh code', async () => {
      const result = await callFunction<
        UpdateDiscountRequest,
        UpdateDiscountResponse
      >({
        functionName: 'updateDiscount',
        data: {
          id: updateTargetId,
          code: 'UPD-RENAMED',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount.code).toBe('UPD-RENAMED');
    });
  });
});
