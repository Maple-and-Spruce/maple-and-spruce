import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  employeeFindAll: vi.fn(),
  timeEntryFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
}));

vi.mock('@maple/firebase/database', () => ({
  EmployeeRepository: { findAll: mocks.employeeFindAll },
  TimeEntryRepository: { findAll: mocks.timeEntryFindAll },
}));

import { getEmployees } from './get-employees';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = getEmployees as unknown as Handler;

const nathan = {
  id: 'nathan-uid',
  name: 'Nathan',
  email: 'n@example.com',
  hourlyRate: 18,
  status: 'active' as const,
};

const someoneElse = {
  id: 'other-uid',
  name: 'Other',
  email: 'o@example.com',
  hourlyRate: 20,
  status: 'active' as const,
};

describe('getEmployees', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes unpaid hours and dollars per employee', async () => {
    mocks.employeeFindAll.mockResolvedValue([nathan, someoneElse]);
    mocks.timeEntryFindAll.mockResolvedValue([
      { id: 'e1', employeeId: 'nathan-uid', hours: 4, status: 'unpaid' },
      { id: 'e2', employeeId: 'nathan-uid', hours: 2.5, status: 'unpaid' },
      { id: 'e3', employeeId: 'other-uid', hours: 1, status: 'unpaid' },
    ]);

    const result = (await handler({}, { uid: 'katie-uid' })) as {
      employees: Array<{
        employee: { id: string };
        unpaidHours: number;
        unpaidAmountDollars: number;
      }>;
    };

    const nathanEntry = result.employees.find(
      (e) => e.employee.id === 'nathan-uid'
    );
    expect(nathanEntry?.unpaidHours).toBe(6.5);
    expect(nathanEntry?.unpaidAmountDollars).toBe(117); // 6.5 * 18

    const otherEntry = result.employees.find(
      (e) => e.employee.id === 'other-uid'
    );
    expect(otherEntry?.unpaidHours).toBe(1);
    expect(otherEntry?.unpaidAmountDollars).toBe(20);
  });

  it('filters to active by default', async () => {
    mocks.employeeFindAll.mockResolvedValue([]);
    mocks.timeEntryFindAll.mockResolvedValue([]);

    await handler({}, { uid: 'katie-uid' });

    expect(mocks.employeeFindAll).toHaveBeenCalledWith({ status: 'active' });
  });

  it('includes inactive employees when requested', async () => {
    mocks.employeeFindAll.mockResolvedValue([]);
    mocks.timeEntryFindAll.mockResolvedValue([]);

    await handler({ includeInactive: true }, { uid: 'katie-uid' });

    expect(mocks.employeeFindAll).toHaveBeenCalledWith(undefined);
  });

  it('only fetches unpaid time entries', async () => {
    mocks.employeeFindAll.mockResolvedValue([]);
    mocks.timeEntryFindAll.mockResolvedValue([]);

    await handler({}, { uid: 'katie-uid' });

    expect(mocks.timeEntryFindAll).toHaveBeenCalledWith({ status: 'unpaid' });
  });
});
