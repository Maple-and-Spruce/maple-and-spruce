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
  program: 'classes',
  appliesTo: 'order',
  nthSlot: 1,
  percent: 20,
};

const AMOUNT_DISCOUNT: CreateAmountDiscount = {
  code: 'TENOFF',
  type: 'amount',
  description: '$10 off any class',
  status: 'active',
  program: 'classes',
  appliesTo: 'order',
  nthSlot: 1,
  amountCents: 1000,
};

const EARLY_BIRD_DISCOUNT: CreateAmountBeforeDateDiscount = {
  code: 'EARLYBIRD',
  type: 'amount-before-date',
  description: '$15 off if registered before cutoff',
  status: 'active',
  program: 'classes',
  appliesTo: 'order',
  nthSlot: 1,
  amountCents: 1500,
  cutoffDate: futureCutoff(),
};

const PAIR_DISCOUNT: CreatePercentDiscount = {
  code: 'PAIR-CRUD',
  type: 'percent',
  description: '50% off second slot',
  status: 'active',
  program: 'classes',
  appliesTo: 'nth-slot-onward',
  nthSlot: 2,
  percent: 50,
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

  describe('Quantity-tier discounts', () => {
    let pairId: string;

    afterAll(async () => {
      if (pairId) {
        await callFunction<DeleteDiscountRequest>({
          functionName: 'deleteDiscount',
          data: { id: pairId },
          idToken: adminUser.idToken,
        });
      }
    });

    it('should create a nth-slot-onward discount with appliesTo + nthSlot persisted', async () => {
      const result = await callFunction<
        CreatePercentDiscount,
        CreateDiscountResponse
      >({
        functionName: 'createDiscount',
        data: PAIR_DISCOUNT,
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount.appliesTo).toBe('nth-slot-onward');
      expect(result.data?.discount.nthSlot).toBe(2);
      pairId = result.data!.discount.id;
    });

    it('should expose appliesTo + nthSlot via public lookup', async () => {
      const result = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'PAIR-CRUD' },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount?.appliesTo).toBe('nth-slot-onward');
      expect(result.data?.discount?.nthSlot).toBe(2);
    });

    it('should reject create with nthSlot < 2 for nth-slot-onward', async () => {
      const result = await callFunction({
        functionName: 'createDiscount',
        data: {
          ...PAIR_DISCOUNT,
          code: 'BAD-NTH',
          nthSlot: 1,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject create when appliesTo=nth-slot-onward but nthSlot is missing', async () => {
      const result = await callFunction({
        functionName: 'createDiscount',
        data: {
          code: 'NTH-MISSING',
          type: 'percent',
          description: 'no nth slot specified',
          status: 'active',
          appliesTo: 'nth-slot-onward',
          percent: 50,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
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

/**
 * Program scoping (#791).
 *
 * Maple & Spruce classes and Music Together settle to **different Square
 * accounts owned by different businesses**. An unscoped code let a Music
 * Together promotion take money off a craft class and vice versa. These tests
 * pin both halves of the fix: the checkout guards, and the authorization line
 * that lets an mt-teacher run her own promotions without touching class
 * pricing.
 */
describe('Discount program scoping', () => {
  let admin: TestUser;
  let mtTeacher: TestUser;

  const MT_CODE: CreatePercentDiscount = {
    code: 'PILOTCLASS',
    type: 'percent',
    description: 'Pilot semester — half off',
    status: 'active',
    program: 'music-together',
    appliesTo: 'order',
    nthSlot: 1,
    percent: 50,
  };

  const CLASS_CODE: CreatePercentDiscount = {
    code: 'CLASSONLY',
    type: 'percent',
    description: '20% off a craft class',
    status: 'active',
    program: 'classes',
    appliesTo: 'order',
    nthSlot: 1,
    percent: 20,
  };

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });

    mtTeacher = await createTestUser('stephanie@test.com', 'test-password');
    await setFirestoreDoc('userRoles', mtTeacher.uid, {
      roles: ['mt-teacher'],
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('authorization', () => {
    it('lets an mt-teacher create a Music Together code', async () => {
      const result = await callFunction<
        CreatePercentDiscount,
        CreateDiscountResponse
      >({
        functionName: 'createDiscount',
        data: MT_CODE,
        idToken: mtTeacher.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount.program).toBe('music-together');
    });

    it('THE POINT: an mt-teacher cannot create a class code', async () => {
      const result = await callFunction<CreatePercentDiscount>({
        functionName: 'createDiscount',
        data: { ...CLASS_CODE, code: 'SNEAKY' },
        idToken: mtTeacher.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('scopes an mt-teacher’s list to Music Together, whatever they ask for', async () => {
      // Seed a class code the mt-teacher must not see, then ask for it
      // explicitly — the server ignores the requested program for non-admins.
      await callFunction<CreatePercentDiscount, CreateDiscountResponse>({
        functionName: 'createDiscount',
        data: CLASS_CODE,
        idToken: admin.idToken,
      });

      const result = await callFunction<
        GetDiscountsRequest,
        GetDiscountsResponse
      >({
        functionName: 'getDiscounts',
        data: { program: 'classes' },
        idToken: mtTeacher.idToken,
      });

      expect(result.status).toBe(200);
      const programs = (result.data?.discounts ?? []).map((d) => d.program);
      expect(programs.length).toBeGreaterThan(0);
      expect(new Set(programs)).toEqual(new Set(['music-together']));
    });

    it('THE BUG: a legacy code with no stored program still lists on the classes page', async () => {
      // Firestore equality filters do NOT match documents that lack the field,
      // so `where('program','==','classes')` silently drops every code written
      // before scoping existed — emptying the classes Discounts page of all
      // real codes. The read-time back-fill in `docToDiscount` cannot help: it
      // runs on documents the query already returned.
      await setFirestoreDoc('discounts', 'legacy-listed', {
        code: 'LEGACYLISTED',
        type: 'percent',
        percent: 10,
        description: 'Written before program scoping existed',
        status: 'active',
        appliesTo: 'order',
        nthSlot: 1,
        usageLimit: null,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await callFunction<
        GetDiscountsRequest,
        GetDiscountsResponse
      >({
        functionName: 'getDiscounts',
        data: { program: 'classes' },
        idToken: admin.idToken,
      });

      expect(result.status).toBe(200);
      const codes = (result.data?.discounts ?? []).map((d) => d.code);
      expect(codes).toContain('LEGACYLISTED');
    });

    it('and a legacy code never leaks onto the Music Together page', async () => {
      const result = await callFunction<
        GetDiscountsRequest,
        GetDiscountsResponse
      >({
        functionName: 'getDiscounts',
        data: { program: 'music-together' },
        idToken: admin.idToken,
      });

      const codes = (result.data?.discounts ?? []).map((d) => d.code);
      expect(codes).not.toContain('LEGACYLISTED');
    });

    it('lets an admin filter to either program', async () => {
      const classes = await callFunction<
        GetDiscountsRequest,
        GetDiscountsResponse
      >({
        functionName: 'getDiscounts',
        data: { program: 'classes' },
        idToken: admin.idToken,
      });

      expect(classes.status).toBe(200);
      expect(
        (classes.data?.discounts ?? []).every((d) => d.program === 'classes')
      ).toBe(true);
      expect(
        (classes.data?.discounts ?? []).some((d) => d.code === 'CLASSONLY')
      ).toBe(true);
    });

    it('an mt-teacher cannot delete a class code', async () => {
      const listed = await callFunction<
        GetDiscountsRequest,
        GetDiscountsResponse
      >({
        functionName: 'getDiscounts',
        data: { program: 'classes' },
        idToken: admin.idToken,
      });
      const classCode = (listed.data?.discounts ?? []).find(
        (d) => d.code === 'CLASSONLY'
      );
      expect(classCode).toBeDefined();

      const result = await callFunction<DeleteDiscountRequest>({
        functionName: 'deleteDiscount',
        data: { id: classCode!.id },
        idToken: mtTeacher.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('an mt-teacher cannot edit a class code', async () => {
      const listed = await callFunction<
        GetDiscountsRequest,
        GetDiscountsResponse
      >({
        functionName: 'getDiscounts',
        data: { program: 'classes' },
        idToken: admin.idToken,
      });
      const classCode = (listed.data?.discounts ?? []).find(
        (d) => d.code === 'CLASSONLY'
      );

      const result = await callFunction<UpdateDiscountRequest>({
        functionName: 'updateDiscount',
        data: { id: classCode!.id, status: 'inactive' },
        idToken: mtTeacher.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('public lookup is program-aware', () => {
    it('returns a Music Together code only to the Music Together checkout', async () => {
      const asMt = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'PILOTCLASS', program: 'music-together' },
      });

      expect(asMt.status).toBe(200);
      expect(asMt.data?.discount?.code).toBe('PILOTCLASS');
    });

    it('hides it from the classes checkout — indistinguishable from unknown', async () => {
      // Unauthenticated endpoint: a different message would let anyone
      // enumerate the other business's live promotions.
      const asClasses = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'PILOTCLASS', program: 'classes' },
      });
      const unknown = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'NO-SUCH-CODE', program: 'classes' },
      });

      expect(asClasses.status).toBe(200);
      expect(asClasses.data?.discount).toBeUndefined();
      expect(asClasses.data).toEqual(unknown.data);
    });

    it('defaults an omitted program to classes (older widget bundles)', async () => {
      const legacy = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'CLASSONLY' },
      });

      expect(legacy.data?.discount?.code).toBe('CLASSONLY');
    });
  });

  describe('legacy codes', () => {
    it('reads a pre-scoping document as a classes code', async () => {
      // Written the way the collection looked before `program` existed. MT had
      // no discount support then, so every such code was for classes —
      // defaulting the other way would expose Stephanie's account.
      await setFirestoreDoc('discounts', 'legacy-doc', {
        code: 'LEGACY',
        type: 'percent',
        percent: 10,
        description: 'Written before program scoping existed',
        status: 'active',
        appliesTo: 'order',
        nthSlot: 1,
        usageLimit: null,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const asClasses = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'LEGACY', program: 'classes' },
      });
      const asMt = await callFunction<
        LookupDiscountRequest,
        LookupDiscountResponse
      >({
        functionName: 'lookupDiscount',
        data: { code: 'LEGACY', program: 'music-together' },
      });

      expect(asClasses.data?.discount?.code).toBe('LEGACY');
      expect(asMt.data?.discount).toBeUndefined();
    });
  });
});
