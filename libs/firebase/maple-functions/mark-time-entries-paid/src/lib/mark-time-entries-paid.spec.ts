import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  timeEntryMarkPaid: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  TimeEntryRepository: { markPaid: mocks.timeEntryMarkPaid },
}));

import { markTimeEntriesPaid } from './mark-time-entries-paid';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = markTimeEntriesPaid as unknown as Handler;

describe('markTimeEntriesPaid', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards to the repository with the admin uid', async () => {
    mocks.timeEntryMarkPaid.mockResolvedValue({
      updatedIds: ['e1', 'e2'],
      alreadyPaidCount: 0,
    });

    const result = (await handler(
      { ids: ['e1', 'e2'] },
      { uid: 'katie-uid' }
    )) as { updatedIds: string[]; alreadyPaidCount: number };

    expect(result.updatedIds).toEqual(['e1', 'e2']);
    expect(mocks.timeEntryMarkPaid).toHaveBeenCalledWith(
      ['e1', 'e2'],
      'katie-uid'
    );
  });

  it('reports skipped already-paid entries', async () => {
    mocks.timeEntryMarkPaid.mockResolvedValue({
      updatedIds: ['e1'],
      alreadyPaidCount: 1,
    });

    const result = (await handler(
      { ids: ['e1', 'e2'] },
      { uid: 'katie-uid' }
    )) as { alreadyPaidCount: number };

    expect(result.alreadyPaidCount).toBe(1);
  });

  it('rejects empty id arrays', async () => {
    await expect(handler({ ids: [] }, { uid: 'katie-uid' })).rejects.toThrow(
      /At least one/
    );
  });

  it('rejects missing ids field', async () => {
    await expect(handler({}, { uid: 'katie-uid' })).rejects.toThrow();
  });
});
