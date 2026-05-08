import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasRole: vi.fn(),
  timeEntryFindById: vi.fn(),
  timeEntryUpdate: vi.fn(),
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
  TimeEntryRepository: {
    findById: mocks.timeEntryFindById,
    update: mocks.timeEntryUpdate,
  },
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { updateTimeEntry } from './update-time-entry';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = updateTimeEntry as unknown as Handler;

const unpaidEntry = {
  id: 'entry-1',
  employeeId: 'nathan-uid',
  date: '2026-05-08',
  hours: 4,
  status: 'unpaid' as const,
  hourlyRateAtCreation: 18,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('updateTimeEntry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets the owner edit their own unpaid entry', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.timeEntryFindById.mockResolvedValue(unpaidEntry);
    mocks.timeEntryUpdate.mockResolvedValue({ ...unpaidEntry, hours: 5 });

    const result = (await handler(
      { id: 'entry-1', hours: 5 },
      { uid: 'nathan-uid' }
    )) as { entry: { hours: number } };

    expect(result.entry.hours).toBe(5);
  });

  it('forbids editing a paid entry as a non-admin', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.timeEntryFindById.mockResolvedValue({
      ...unpaidEntry,
      status: 'paid',
    });

    await expect(
      handler({ id: 'entry-1', hours: 5 }, { uid: 'nathan-uid' })
    ).rejects.toThrow(/Cannot edit a paid time entry/);
  });

  it('forbids editing someone else’s entry as a non-admin', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.timeEntryFindById.mockResolvedValue(unpaidEntry);

    await expect(
      handler({ id: 'entry-1', hours: 5 }, { uid: 'someone-else' })
    ).rejects.toThrow(/your own/);
  });

  it('admin can edit a paid entry', async () => {
    mocks.hasRole.mockResolvedValue(true);
    mocks.timeEntryFindById.mockResolvedValue({
      ...unpaidEntry,
      status: 'paid',
    });
    mocks.timeEntryUpdate.mockResolvedValue({
      ...unpaidEntry,
      status: 'paid',
      hours: 6,
    });

    const result = (await handler(
      { id: 'entry-1', hours: 6 },
      { uid: 'katie-uid' }
    )) as { entry: { hours: number } };

    expect(result.entry.hours).toBe(6);
  });

  it('rejects invalid hours via validation', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.timeEntryFindById.mockResolvedValue(unpaidEntry);

    await expect(
      handler({ id: 'entry-1', hours: -3 }, { uid: 'nathan-uid' })
    ).rejects.toThrow(/Validation failed/);
  });

  it('throws when entry is missing', async () => {
    mocks.timeEntryFindById.mockResolvedValue(undefined);

    await expect(
      handler({ id: 'missing', hours: 5 }, { uid: 'nathan-uid' })
    ).rejects.toThrow(/TimeEntry not found/);
  });
});
