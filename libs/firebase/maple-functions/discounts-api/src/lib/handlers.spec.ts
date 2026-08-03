import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Handler-level spec for the discounts domain (#731, ADR-029).
 *
 * The five standalone discount functions shipped with ZERO unit tests. Moving
 * them onto a router is exactly the wrong moment to still have none — these
 * lock in the behaviour the router must preserve, so a future refactor that
 * changes an error message or a return shape fails here rather than in a
 * customer's checkout.
 *
 * Repositories are mocked (ADR-017).
 */
const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  findByCode: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  isDiscountValid: vi.fn(),
  discountValidation: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  DiscountRepository: {
    findAll: mocks.findAll,
    findByCode: mocks.findByCode,
    findById: mocks.findById,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.remove,
  },
}));

vi.mock('@maple/ts/domain', () => ({
  isDiscountValid: mocks.isDiscountValid,
}));

vi.mock('@maple/ts/validation', () => ({
  discountValidation: mocks.discountValidation,
}));

import {
  createDiscountHandler,
  deleteDiscountHandler,
  getDiscountsHandler,
  lookupDiscountHandler,
  updateDiscountHandler,
} from './handlers';

const DISCOUNT = { id: 'd1', code: 'SAVE10', percentOff: 10 };

/** Vest-style result stub. */
function validation({ valid = true, errors = {} } = {}) {
  return {
    isValid: () => valid,
    hasErrors: () => !valid,
    getErrors: () => errors,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.discountValidation.mockReturnValue(validation());
});

describe('getDiscountsHandler', () => {
  it('passes the status filter through and returns the list', async () => {
    mocks.findAll.mockResolvedValue([DISCOUNT]);

    const res = await getDiscountsHandler({ status: 'active' } as never);

    expect(mocks.findAll).toHaveBeenCalledWith({ status: 'active' });
    expect(res).toEqual({ discounts: [DISCOUNT] });
  });

  it('passes undefined status when none is given', async () => {
    mocks.findAll.mockResolvedValue([]);

    await getDiscountsHandler({} as never);

    expect(mocks.findAll).toHaveBeenCalledWith({ status: undefined });
  });
});

describe('createDiscountHandler', () => {
  it('creates when valid and the code is free', async () => {
    mocks.findByCode.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue(DISCOUNT);

    const res = await createDiscountHandler({ code: 'SAVE10' } as never);

    expect(res).toEqual({ discount: DISCOUNT });
  });

  it('rejects invalid input with the field-joined message', async () => {
    mocks.discountValidation.mockReturnValue(
      validation({ valid: false, errors: { code: ['is required'] } }),
    );

    await expect(createDiscountHandler({} as never)).rejects.toThrow(
      'Validation failed: code: is required',
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate code, uppercased in the message', async () => {
    mocks.findByCode.mockResolvedValue(DISCOUNT);

    await expect(
      createDiscountHandler({ code: 'save10' } as never),
    ).rejects.toThrow('Discount code "SAVE10" already exists');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('validates BEFORE touching the repository', async () => {
    mocks.discountValidation.mockReturnValue(validation({ valid: false }));

    await expect(createDiscountHandler({} as never)).rejects.toThrow();

    expect(mocks.findByCode).not.toHaveBeenCalled();
  });
});

describe('updateDiscountHandler', () => {
  it('requires an id', async () => {
    await expect(updateDiscountHandler({} as never)).rejects.toThrow(
      /Discount ID is required/,
    );
  });

  it('404s when the discount is missing', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(
      updateDiscountHandler({ id: 'nope' } as never),
    ).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('validates only the changed fields, merged over the existing record', async () => {
    mocks.findById.mockResolvedValue(DISCOUNT);
    mocks.update.mockResolvedValue({ ...DISCOUNT, percentOff: 25 });

    await updateDiscountHandler({ id: 'd1', percentOff: 25 } as never);

    expect(mocks.discountValidation).toHaveBeenCalledWith(
      { ...DISCOUNT, percentOff: 25 },
      ['percentOff'],
    );
  });

  it('rejects renaming onto an existing code', async () => {
    mocks.findById.mockResolvedValue(DISCOUNT);
    mocks.findByCode.mockResolvedValue({ id: 'other', code: 'TAKEN' });

    await expect(
      updateDiscountHandler({ id: 'd1', code: 'taken' } as never),
    ).rejects.toThrow('Discount code "TAKEN" already exists');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows saving the same code back unchanged (no false conflict)', async () => {
    mocks.findById.mockResolvedValue(DISCOUNT);
    mocks.update.mockResolvedValue(DISCOUNT);

    await updateDiscountHandler({ id: 'd1', code: 'SAVE10' } as never);

    // Same code as existing -> uniqueness lookup must be skipped entirely.
    expect(mocks.findByCode).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalled();
  });
});

describe('deleteDiscountHandler', () => {
  it('requires an id', async () => {
    await expect(deleteDiscountHandler({} as never)).rejects.toThrow(
      'Discount ID is required',
    );
  });

  it('404s when missing, without deleting', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(
      deleteDiscountHandler({ id: 'gone' } as never),
    ).rejects.toThrow('Discount not found: gone');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('deletes and reports success', async () => {
    mocks.findById.mockResolvedValue(DISCOUNT);

    const res = await deleteDiscountHandler({ id: 'd1' } as never);

    expect(mocks.remove).toHaveBeenCalledWith('d1');
    expect(res).toEqual({ success: true });
  });
});

describe('lookupDiscountHandler (public)', () => {
  it('returns the discount when found and valid', async () => {
    mocks.findByCode.mockResolvedValue(DISCOUNT);
    mocks.isDiscountValid.mockReturnValue(true);

    expect(await lookupDiscountHandler({ code: 'SAVE10' } as never)).toEqual({
      discount: DISCOUNT,
    });
  });

  // The checkout form treats "no discount" as a normal outcome. Throwing here
  // would surface as a payment-flow error to a customer mistyping a code.
  it.each([
    ['a missing code', {}],
    ['an empty code', { code: '' }],
    ['a non-string code', { code: 123 }],
  ])('returns undefined for %s without throwing', async (_label, input) => {
    const res = await lookupDiscountHandler(input as never);

    expect(res).toEqual({ discount: undefined });
    expect(mocks.findByCode).not.toHaveBeenCalled();
  });

  it('returns undefined for an unknown code', async () => {
    mocks.findByCode.mockResolvedValue(undefined);

    expect(await lookupDiscountHandler({ code: 'NOPE' } as never)).toEqual({
      discount: undefined,
    });
  });

  it('returns undefined for an expired/inactive discount', async () => {
    mocks.findByCode.mockResolvedValue(DISCOUNT);
    mocks.isDiscountValid.mockReturnValue(false);

    expect(await lookupDiscountHandler({ code: 'SAVE10' } as never)).toEqual({
      discount: undefined,
    });
  });
});
