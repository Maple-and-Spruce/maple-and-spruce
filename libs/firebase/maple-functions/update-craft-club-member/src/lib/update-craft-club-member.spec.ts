import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  },
  throwValidationError: (errors: Record<string, string[]>) => {
    throw new Error(`validation: ${Object.keys(errors).join(',')}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
}));

import { updateCraftClubMember } from './update-craft-club-member';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = updateCraftClubMember as unknown as Handler;
const ADMIN = { uid: 'admin-uid' };

const existing = {
  id: 'm1',
  email: 'member@example.com',
  name: 'Member',
  status: 'approved',
};

describe('updateCraftClubMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an id', async () => {
    await expect(handler({}, ADMIN)).rejects.toThrow(/Member ID is required/);
  });

  it('throws not-found for an unknown member', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(handler({ id: 'missing' }, ADMIN)).rejects.toThrow(
      /Craft Club member missing not found/
    );
  });

  it('updates status and notes', async () => {
    mocks.findById.mockResolvedValue(existing);
    mocks.update.mockImplementation(async (input) => ({ ...existing, ...input }));

    await handler(
      { id: 'm1', status: 'cancelled', notes: 'left the program' },
      ADMIN
    );

    expect(mocks.update).toHaveBeenCalledWith({
      id: 'm1',
      status: 'cancelled',
      notes: 'left the program',
    });
  });

  it('rejects an invalid name before writing', async () => {
    mocks.findById.mockResolvedValue(existing);

    await expect(
      handler({ id: 'm1', name: 'x' }, ADMIN)
    ).rejects.toThrow(/validation: name/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
