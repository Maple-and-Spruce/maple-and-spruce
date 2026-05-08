import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasRole: vi.fn(),
  employeeFindById: vi.fn(),
  timeEntryCreate: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAuthenticatedFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  hasRole: mocks.hasRole,
  Role: { Admin: 'admin', Employee: 'employee' },
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
  throwFailedPrecondition: (msg: string) => {
    throw new Error(msg);
  },
  throwValidationError: (errors: Record<string, string[]>) => {
    throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  EmployeeRepository: { findById: mocks.employeeFindById },
  TimeEntryRepository: { create: mocks.timeEntryCreate },
}));

import { createTimeEntry } from './create-time-entry';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = createTimeEntry as unknown as Handler;

const activeEmployee = {
  id: 'nathan-uid',
  name: 'Nathan',
  email: 'n@example.com',
  hourlyRate: 18,
  status: 'active' as const,
  grantedBy: 'katie-uid',
  grantedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('createTimeEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets an employee log their own hours', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.employeeFindById.mockResolvedValue(activeEmployee);
    mocks.timeEntryCreate.mockResolvedValue({ id: 'entry-1' });

    const result = (await handler(
      {
        employeeId: 'nathan-uid',
        date: '2026-05-08',
        hours: 4,
      },
      { uid: 'nathan-uid' }
    )) as { entry: { id: string } };

    expect(result.entry.id).toBe('entry-1');
    expect(mocks.timeEntryCreate).toHaveBeenCalledWith({
      employeeId: 'nathan-uid',
      date: '2026-05-08',
      hours: 4,
      notes: undefined,
      hourlyRateAtCreation: 18,
    });
  });

  it('forces non-admin to log under their own UID even if they pass another', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.employeeFindById.mockResolvedValue(activeEmployee);
    mocks.timeEntryCreate.mockResolvedValue({ id: 'entry-1' });

    await handler(
      {
        employeeId: 'someone-else',
        date: '2026-05-08',
        hours: 4,
      },
      { uid: 'nathan-uid' }
    );

    expect(mocks.employeeFindById).toHaveBeenCalledWith('nathan-uid');
  });

  it('lets admin log on behalf of another employee', async () => {
    mocks.hasRole.mockResolvedValue(true);
    mocks.employeeFindById.mockResolvedValue(activeEmployee);
    mocks.timeEntryCreate.mockResolvedValue({ id: 'entry-1' });

    await handler(
      {
        employeeId: 'nathan-uid',
        date: '2026-05-08',
        hours: 4,
      },
      { uid: 'katie-uid' }
    );

    expect(mocks.employeeFindById).toHaveBeenCalledWith('nathan-uid');
  });

  it('rejects invalid hours', async () => {
    mocks.hasRole.mockResolvedValue(false);

    await expect(
      handler(
        { employeeId: 'nathan-uid', date: '2026-05-08', hours: -1 },
        { uid: 'nathan-uid' }
      )
    ).rejects.toThrow(/Validation failed/);
  });

  it('throws when employee record is missing', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.employeeFindById.mockResolvedValue(undefined);

    await expect(
      handler(
        { employeeId: 'nathan-uid', date: '2026-05-08', hours: 4 },
        { uid: 'nathan-uid' }
      )
    ).rejects.toThrow(/Employee not found/);
  });

  it('blocks logging for an inactive employee', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.employeeFindById.mockResolvedValue({
      ...activeEmployee,
      status: 'inactive',
    });

    await expect(
      handler(
        { employeeId: 'nathan-uid', date: '2026-05-08', hours: 4 },
        { uid: 'nathan-uid' }
      )
    ).rejects.toThrow(/inactive/);
  });
});
