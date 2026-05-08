import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  employeeFindById: vi.fn(),
  employeeUpdate: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
  throwValidationError: (errors: Record<string, string[]>) => {
    throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  EmployeeRepository: {
    findById: mocks.employeeFindById,
    update: mocks.employeeUpdate,
  },
}));

import { updateEmployee } from './update-employee';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = updateEmployee as unknown as Handler;

const nathan = {
  id: 'nathan-uid',
  name: 'Nathan',
  email: 'nathan@example.com',
  hourlyRate: 18,
  status: 'active' as const,
};

describe('updateEmployee', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates an existing employee', async () => {
    mocks.employeeFindById.mockResolvedValue(nathan);
    mocks.employeeUpdate.mockResolvedValue({ ...nathan, hourlyRate: 22 });

    const result = (await handler(
      { id: 'nathan-uid', hourlyRate: 22 },
      { uid: 'katie-uid' }
    )) as { employee: { hourlyRate: number } };

    expect(result.employee.hourlyRate).toBe(22);
  });

  it('throws when the employee does not exist', async () => {
    mocks.employeeFindById.mockResolvedValue(undefined);

    await expect(
      handler({ id: 'missing', hourlyRate: 22 }, { uid: 'katie-uid' })
    ).rejects.toThrow(/Employee not found/);
  });

  it('rejects invalid hourly rate', async () => {
    mocks.employeeFindById.mockResolvedValue(nathan);

    await expect(
      handler({ id: 'nathan-uid', hourlyRate: -5 }, { uid: 'katie-uid' })
    ).rejects.toThrow(/Validation failed/);
  });

  it('rejects missing id', async () => {
    await expect(
      handler({ hourlyRate: 22 }, { uid: 'katie-uid' })
    ).rejects.toThrow(/Employee ID is required/);
  });

  it('handles deactivation as a status update', async () => {
    mocks.employeeFindById.mockResolvedValue(nathan);
    mocks.employeeUpdate.mockResolvedValue({ ...nathan, status: 'inactive' });

    const result = (await handler(
      { id: 'nathan-uid', status: 'inactive' },
      { uid: 'katie-uid' }
    )) as { employee: { status: string } };

    expect(result.employee.status).toBe('inactive');
  });
});
