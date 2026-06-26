import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  findByEmail: vi.fn(),
  createAccessToken: vi.fn(),
  mailAdd: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    usingStrings: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-function';
    }),
  };
  return {
    Functions: { endpoint },
    throwInvalidArgument: (m: string) => {
      throw new Error(m);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: { findByEmail: mocks.findByEmail },
  CraftClubTokenRepository: { createAccessToken: mocks.createAccessToken },
  getDb: () => ({ collection: () => ({ add: mocks.mailAdd }) }),
}));

import './request-craft-club-manage-link';

const STRINGS = { CRAFT_CLUB_MANAGE_URL: 'https://site.example/manage' };
const run = (data: unknown) => mocks.capturedHandler!(data, {}, {}, STRINGS);

describe('requestCraftClubManageLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emails a magic link with the token when the email is a member', async () => {
    mocks.findByEmail.mockResolvedValue({
      id: 'm1',
      email: 'member@example.com',
    });
    mocks.createAccessToken.mockResolvedValue('rawtok123');

    const result = (await run({ email: 'member@example.com' })) as {
      ok: boolean;
    };

    expect(result.ok).toBe(true);
    expect(mocks.createAccessToken).toHaveBeenCalledWith('member@example.com');
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
    const mailDoc = mocks.mailAdd.mock.calls[0][0];
    expect(mailDoc.to).toBe('member@example.com');
    expect(mailDoc.template.name).toBe('craft-club-manage-link');
    expect(mailDoc.template.data.manageUrl).toContain('token=rawtok123');
  });

  it('returns ok without emailing when the email is not a member (no enumeration)', async () => {
    mocks.findByEmail.mockResolvedValue(undefined);

    const result = (await run({ email: 'stranger@example.com' })) as {
      ok: boolean;
    };

    expect(result.ok).toBe(true);
    expect(mocks.createAccessToken).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('rejects a missing email', async () => {
    await expect(run({})).rejects.toThrow(/Email is required/);
  });
});
