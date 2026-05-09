import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasRole: vi.fn(),
  timeEntryFindAll: vi.fn(),
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
}));

vi.mock('@maple/firebase/database', () => ({
  TimeEntryRepository: { findAll: mocks.timeEntryFindAll },
}));

import { getTimeEntries } from './get-time-entries';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = getTimeEntries as unknown as Handler;

describe('getTimeEntries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin can pass any employeeId', async () => {
    mocks.hasRole.mockResolvedValue(true);
    mocks.timeEntryFindAll.mockResolvedValue([]);

    await handler(
      { employeeId: 'nathan-uid', status: 'unpaid' },
      { uid: 'katie-uid' }
    );

    expect(mocks.timeEntryFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'nathan-uid', status: 'unpaid' })
    );
  });

  it('non-admin is forced to their own UID regardless of payload', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.timeEntryFindAll.mockResolvedValue([]);

    await handler(
      { employeeId: 'someone-else' },
      { uid: 'nathan-uid' }
    );

    expect(mocks.timeEntryFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'nathan-uid' })
    );
  });

  it('passes through date filters', async () => {
    mocks.hasRole.mockResolvedValue(true);
    mocks.timeEntryFindAll.mockResolvedValue([]);

    await handler(
      { startDate: '2026-05-01', endDate: '2026-05-31' },
      { uid: 'katie-uid' }
    );

    expect(mocks.timeEntryFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      })
    );
  });
});
