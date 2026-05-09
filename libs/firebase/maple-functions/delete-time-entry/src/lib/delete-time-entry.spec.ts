import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasRole: vi.fn(),
  timeEntryFindById: vi.fn(),
  timeEntryDelete: vi.fn(),
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
}));

vi.mock('@maple/firebase/database', () => ({
  TimeEntryRepository: {
    findById: mocks.timeEntryFindById,
    delete: mocks.timeEntryDelete,
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

import { deleteTimeEntry } from './delete-time-entry';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = deleteTimeEntry as unknown as Handler;

const unpaid = {
  id: 'entry-1',
  employeeId: 'nathan-uid',
  status: 'unpaid' as const,
};

describe('deleteTimeEntry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets the owner delete their own unpaid entry', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.timeEntryFindById.mockResolvedValue(unpaid);

    const result = (await handler(
      { id: 'entry-1' },
      { uid: 'nathan-uid' }
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mocks.timeEntryDelete).toHaveBeenCalledWith('entry-1');
  });

  it('blocks deleting a paid entry as a non-admin', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.timeEntryFindById.mockResolvedValue({ ...unpaid, status: 'paid' });

    await expect(
      handler({ id: 'entry-1' }, { uid: 'nathan-uid' })
    ).rejects.toThrow(/Cannot delete a paid/);
  });

  it("blocks deleting someone else's entry as a non-admin", async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.timeEntryFindById.mockResolvedValue(unpaid);

    await expect(
      handler({ id: 'entry-1' }, { uid: 'someone-else' })
    ).rejects.toThrow(/your own/);
  });

  it('admin can delete any entry, including paid ones', async () => {
    mocks.hasRole.mockResolvedValue(true);
    mocks.timeEntryFindById.mockResolvedValue({ ...unpaid, status: 'paid' });

    await handler({ id: 'entry-1' }, { uid: 'katie-uid' });
    expect(mocks.timeEntryDelete).toHaveBeenCalled();
  });
});
