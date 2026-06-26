import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createPublicFunction: <TReq, TRes>(
    handler: (data: TReq) => Promise<TRes>
  ) => handler,
  throwValidationError: (errors: Record<string, string[]>) => {
    throw new Error(`validation: ${Object.keys(errors).join(',')}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: {
    findByEmail: mocks.findByEmail,
    create: mocks.create,
  },
}));

import { requestCraftClubAccess } from './request-craft-club-access';

type Handler = (data: unknown) => Promise<{ status: string }>;
const handler = requestCraftClubAccess as unknown as Handler;

describe('requestCraftClubAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a requested record for a new email', async () => {
    mocks.findByEmail.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ id: 'x' });

    const r = await handler({ email: 'new@example.com', name: 'New' });

    expect(r).toEqual({ status: 'requested' });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', status: 'requested' })
    );
  });

  it('does not duplicate; reports approved for an approved email', async () => {
    mocks.findByEmail.mockResolvedValue({ status: 'approved' });
    const r = await handler({ email: 'a@b.com' });
    expect(r).toEqual({ status: 'approved' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('reports active for a current member', async () => {
    mocks.findByEmail.mockResolvedValue({ status: 'active' });
    expect((await handler({ email: 'a@b.com' })).status).toBe('active');
  });

  it('rejects an invalid email before writing', async () => {
    await expect(handler({ email: 'bad' })).rejects.toThrow(/validation: email/);
    expect(mocks.findByEmail).not.toHaveBeenCalled();
  });
});
