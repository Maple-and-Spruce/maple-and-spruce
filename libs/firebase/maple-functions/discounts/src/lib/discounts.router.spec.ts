import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  findById: vi.fn(),
  findByCode: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  assertCanManageDiscountProgram: vi.fn(),
  discountProgramScopeForUser: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, m: string) {
      super(m);
    }
  }
  // Each route records the roles it was gated on and its handler.
  const endpoint = {
    requiringRole: (roles: unknown) => ({
      asRoute: (handler: unknown) => ({ roles, handler }),
    }),
  };
  return {
    Functions: {
      endpoint,
      router: (_name: string, routes: unknown) => routes,
    },
    Role: { Admin: 'admin', MtTeacher: 'mt-teacher' },
    assertCanManageDiscountProgram: mocks.assertCanManageDiscountProgram,
    discountProgramScopeForUser: mocks.discountProgramScopeForUser,
    throwFailedPrecondition: (m: string) => {
      throw new HttpsError('failed-precondition', m);
    },
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} ${id} not found`);
    },
    throwValidationError: (errors: Record<string, string[]>) => {
      throw new HttpsError('invalid-argument', JSON.stringify(errors));
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  DiscountRepository: {
    findAll: mocks.findAll,
    findById: mocks.findById,
    findByCode: mocks.findByCode,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.remove,
  },
}));

import { discounts } from './discounts.router';

type Route = {
  roles: unknown;
  handler: (data: unknown, context: unknown) => Promise<unknown>;
};
const routes = discounts as unknown as Record<string, Route>;

const ADMIN = { uid: 'admin-1' };
const MT_TEACHER = { uid: 'mt-teacher-1' };

const NEW_CODE = {
  code: 'SAVE20',
  type: 'percent',
  description: '20% off any class',
  status: 'active',
  program: 'classes',
  appliesTo: 'order',
  nthSlot: 1,
  percent: 20,
};
const STORED = { ...NEW_CODE, id: 'disc-1' };

describe('discounts router (#62)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCanManageDiscountProgram.mockResolvedValue(undefined);
  });

  it.each(['getDiscounts', 'createDiscount', 'updateDiscount', 'deleteDiscount'])(
    '%s is open to admins and the Music Together teacher',
    (route) => {
      expect(routes[route].roles).toEqual(['admin', 'mt-teacher']);
    }
  );

  it('does not carry the public lookup, which stays its own function', () => {
    expect(routes['lookupDiscount']).toBeUndefined();
  });

  describe('getDiscounts', () => {
    it("passes an admin's program filter through", async () => {
      mocks.discountProgramScopeForUser.mockResolvedValue(undefined);
      mocks.findAll.mockResolvedValue([STORED]);

      const result = await routes['getDiscounts'].handler(
        { status: 'active', program: 'classes' },
        ADMIN
      );

      expect(mocks.findAll).toHaveBeenCalledWith({
        status: 'active',
        program: 'classes',
      });
      expect(result).toEqual({ discounts: [STORED] });
    });

    it('forces a non-admin to Music Together whatever they ask for', async () => {
      mocks.discountProgramScopeForUser.mockResolvedValue('music-together');
      mocks.findAll.mockResolvedValue([]);

      await routes['getDiscounts'].handler({ program: 'classes' }, MT_TEACHER);

      expect(mocks.findAll).toHaveBeenCalledWith({
        status: undefined,
        program: 'music-together',
      });
    });
  });

  describe('createDiscount', () => {
    it('creates a valid, unused code', async () => {
      mocks.findByCode.mockResolvedValue(undefined);
      mocks.create.mockResolvedValue(STORED);

      const result = await routes['createDiscount'].handler(NEW_CODE, ADMIN);

      expect(mocks.assertCanManageDiscountProgram).toHaveBeenCalledWith(
        ADMIN,
        'classes'
      );
      expect(mocks.create).toHaveBeenCalledWith(NEW_CODE);
      expect(result).toEqual({ discount: STORED });
    });

    it('stops before anything else when the caller may not manage the program', async () => {
      mocks.assertCanManageDiscountProgram.mockRejectedValue(
        new Error('You can only manage Music Together discount codes.')
      );

      await expect(
        routes['createDiscount'].handler(NEW_CODE, MT_TEACHER)
      ).rejects.toThrow('You can only manage Music Together discount codes.');
      expect(mocks.findByCode).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('refuses an invalid code', async () => {
      await expect(
        routes['createDiscount'].handler({ ...NEW_CODE, percent: 0 }, ADMIN)
      ).rejects.toThrow(/Validation failed/);
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('refuses a code already used, naming the program that owns it', async () => {
      mocks.findByCode.mockResolvedValue({
        ...STORED,
        program: 'music-together',
      });

      await expect(
        routes['createDiscount'].handler(NEW_CODE, ADMIN)
      ).rejects.toThrow('Discount code "SAVE20" already exists (Music Together).');
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe('updateDiscount', () => {
    it('needs an id', async () => {
      await expect(
        routes['updateDiscount'].handler({ description: 'x' }, ADMIN)
      ).rejects.toThrow('Discount ID is required');
    });

    it('reports a missing discount', async () => {
      mocks.findById.mockResolvedValue(undefined);

      await expect(
        routes['updateDiscount'].handler({ id: 'nope' }, ADMIN)
      ).rejects.toThrow('Discount nope not found');
    });

    it('authorizes on the stored program, not the request', async () => {
      mocks.findById.mockResolvedValue(STORED);
      mocks.update.mockResolvedValue(STORED);

      await routes['updateDiscount'].handler(
        { id: 'disc-1', description: 'New words' },
        MT_TEACHER
      );

      expect(mocks.assertCanManageDiscountProgram).toHaveBeenCalledWith(
        MT_TEACHER,
        'classes'
      );
    });

    it('updates the changed fields', async () => {
      mocks.findById.mockResolvedValue(STORED);
      const updated = { ...STORED, description: 'New words' };
      mocks.update.mockResolvedValue(updated);

      const result = await routes['updateDiscount'].handler(
        { id: 'disc-1', description: 'New words' },
        ADMIN
      );

      expect(mocks.update).toHaveBeenCalledWith({
        id: 'disc-1',
        description: 'New words',
      });
      expect(result).toEqual({ discount: updated });
    });

    it('refuses an invalid change', async () => {
      mocks.findById.mockResolvedValue(STORED);

      await expect(
        routes['updateDiscount'].handler({ id: 'disc-1', percent: 0 }, ADMIN)
      ).rejects.toThrow(/percent/);
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('refuses renaming onto a code already in use', async () => {
      mocks.findById.mockResolvedValue(STORED);
      mocks.findByCode.mockResolvedValue({ ...STORED, id: 'disc-2' });

      await expect(
        routes['updateDiscount'].handler({ id: 'disc-1', code: 'taken' }, ADMIN)
      ).rejects.toThrow('Discount code "TAKEN" already exists');
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('lets a code keep its own name', async () => {
      mocks.findById.mockResolvedValue(STORED);
      mocks.update.mockResolvedValue(STORED);

      await routes['updateDiscount'].handler(
        { id: 'disc-1', code: 'save20' },
        ADMIN
      );

      expect(mocks.findByCode).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalled();
    });
  });

  describe('deleteDiscount', () => {
    it('needs an id', async () => {
      await expect(routes['deleteDiscount'].handler({}, ADMIN)).rejects.toThrow(
        'Discount ID is required'
      );
    });

    it('reports a missing discount', async () => {
      mocks.findById.mockResolvedValue(undefined);

      await expect(
        routes['deleteDiscount'].handler({ id: 'nope' }, ADMIN)
      ).rejects.toThrow('Discount nope not found');
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('authorizes on the stored program before deleting', async () => {
      mocks.findById.mockResolvedValue(STORED);
      mocks.assertCanManageDiscountProgram.mockRejectedValue(
        new Error('You can only manage Music Together discount codes.')
      );

      await expect(
        routes['deleteDiscount'].handler({ id: 'disc-1' }, MT_TEACHER)
      ).rejects.toThrow('You can only manage Music Together discount codes.');
      expect(mocks.assertCanManageDiscountProgram).toHaveBeenCalledWith(
        MT_TEACHER,
        'classes'
      );
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('deletes it', async () => {
      mocks.findById.mockResolvedValue(STORED);

      await expect(
        routes['deleteDiscount'].handler({ id: 'disc-1' }, ADMIN)
      ).resolves.toEqual({ success: true });
      expect(mocks.remove).toHaveBeenCalledWith('disc-1');
    });
  });
});
