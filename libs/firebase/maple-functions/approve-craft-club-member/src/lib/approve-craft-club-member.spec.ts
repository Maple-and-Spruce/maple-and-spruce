import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
  throwValidationError: (errors: Record<string, string[]>) => {
    throw new Error(`validation: ${Object.keys(errors).join(',')}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: {
    findByEmail: mocks.findByEmail,
    create: mocks.create,
    update: mocks.update,
  },
}));

// Use the real (pure) validation + domain helpers.

import { approveCraftClubMember } from './approve-craft-club-member';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = approveCraftClubMember as unknown as Handler;
const ADMIN = { uid: 'admin-uid' };

describe('approveCraftClubMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new approved member when the email is unknown', async () => {
    mocks.findByEmail.mockResolvedValue(undefined);
    mocks.create.mockImplementation(async (input) => ({ id: 'new', ...input }));

    const result = (await handler(
      { email: 'New@Example.com', name: 'New Person' },
      ADMIN
    )) as { member: { status: string } };

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'New@Example.com',
        name: 'New Person',
        status: 'approved',
        approvedBy: 'admin-uid',
      })
    );
    expect(result.member.status).toBe('approved');
  });

  it('promotes an existing requested member to approved', async () => {
    mocks.findByEmail.mockResolvedValue({
      id: 'm1',
      email: 'req@example.com',
      status: 'requested',
    });
    mocks.update.mockImplementation(async (input) => ({ ...input }));

    await handler({ email: 'req@example.com' }, ADMIN);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', status: 'approved' })
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('never downgrades a live subscriber', async () => {
    mocks.findByEmail.mockResolvedValue({
      id: 'm2',
      email: 'active@example.com',
      status: 'active',
    });
    mocks.update.mockImplementation(async (input) => ({ ...input }));

    await handler({ email: 'active@example.com' }, ADMIN);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm2', status: 'active' })
    );
  });

  it('rejects an invalid email before touching the repository', async () => {
    await expect(
      handler({ email: 'not-an-email' }, ADMIN)
    ).rejects.toThrow(/validation: email/);
    expect(mocks.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects a missing caller uid (defensive)', async () => {
    await expect(
      handler({ email: 'someone@example.com' }, {})
    ).rejects.toThrow(/Authentication required/);
  });
});
