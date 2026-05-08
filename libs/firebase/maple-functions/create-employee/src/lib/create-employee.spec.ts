import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  employeeFindById: vi.fn(),
  employeeCreate: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwAlreadyExists: (entity: string, field: string, value: string) => {
    throw new Error(`${entity} with ${field} ${value} already exists`);
  },
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
  throwValidationError: (errors: Record<string, string[]>) => {
    throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  EmployeeRepository: {
    findById: mocks.employeeFindById,
    create: mocks.employeeCreate,
  },
}));

import { createEmployee } from './create-employee';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = createEmployee as unknown as Handler;

const validInput = {
  id: 'nathan-uid',
  name: 'Nathan',
  email: 'nathan@example.com',
  hourlyRate: 18,
};

describe('createEmployee', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an employee record with the granting admin attribution', async () => {
    mocks.employeeFindById.mockResolvedValue(undefined);
    mocks.employeeCreate.mockResolvedValue({ ...validInput, status: 'active' });

    const result = (await handler(validInput, { uid: 'katie-uid' })) as {
      employee: { id: string };
    };

    expect(result.employee.id).toBe('nathan-uid');
    expect(mocks.employeeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'nathan-uid', grantedBy: 'katie-uid' })
    );
  });

  it('rejects when the UID is already an employee', async () => {
    mocks.employeeFindById.mockResolvedValue({ id: 'nathan-uid' });

    await expect(handler(validInput, { uid: 'katie-uid' })).rejects.toThrow(
      /already exists/
    );
  });

  it('rejects invalid input via validation', async () => {
    await expect(
      handler(
        { ...validInput, email: 'not-an-email' },
        { uid: 'katie-uid' }
      )
    ).rejects.toThrow(/Validation failed/);
  });

  it('rejects missing UID', async () => {
    await expect(
      handler({ ...validInput, id: '' }, { uid: 'katie-uid' })
    ).rejects.toThrow(/Validation failed/);
  });
});
