import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  findAll: vi.fn(),
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
  MusicTogetherRegistrationRepository: { findAll: mocks.findAll },
  MusicTogetherTokenRepository: { createAccessToken: mocks.createAccessToken },
  getDb: () => ({ collection: () => ({ add: mocks.mailAdd }) }),
}));

import './request-music-together-manage-link';

const STRINGS = {
  MUSIC_TOGETHER_MANAGE_URL: 'https://site.example/mt-manage',
};
const run = (data: unknown) => mocks.capturedHandler!(data, {}, {}, STRINGS);

const EMAIL = 'family@example.com';

const manageable = {
  id: 'reg-1',
  email: EMAIL,
  paymentPlan: 'installments',
  status: 'confirmed',
  squareCustomerId: 'cust-1',
  squareCardId: 'card-1',
};

describe('requestMusicTogetherManageLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emails a magic link scoped to the registration when manageable', async () => {
    mocks.findAll.mockResolvedValue([manageable]);
    mocks.createAccessToken.mockResolvedValue('rawtok123');

    const result = (await run({ email: EMAIL })) as {
      ok: boolean;
    };

    expect(result.ok).toBe(true);
    expect(mocks.createAccessToken).toHaveBeenCalledWith('reg-1');
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
    const mailDoc = mocks.mailAdd.mock.calls[0][0];
    expect(mailDoc.to).toBe(EMAIL);
    expect(mailDoc.template.name).toBe('music-together-manage-link');
    expect(mailDoc.template.data.manageUrl).toContain('token=rawtok123');
  });

  it('picks the most recent manageable registration (findAll is newest-first)', async () => {
    mocks.findAll.mockResolvedValue([
      { ...manageable, id: 'reg-new' },
      { ...manageable, id: 'reg-old' },
    ]);
    mocks.createAccessToken.mockResolvedValue('tok');

    await run({ email: EMAIL });

    expect(mocks.createAccessToken).toHaveBeenCalledWith('reg-new');
  });

  it('does not email pay-in-full or cancelled registrations (no enumeration)', async () => {
    mocks.findAll.mockResolvedValue([
      { ...manageable, paymentPlan: 'full' },
      { ...manageable, status: 'cancelled' },
    ]);

    const result = (await run({ email: EMAIL })) as {
      ok: boolean;
    };

    expect(result.ok).toBe(true);
    expect(mocks.createAccessToken).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('returns ok without emailing when nothing matches the email', async () => {
    mocks.findAll.mockResolvedValue([]);

    const result = (await run({ email: 'stranger@example.com' })) as {
      ok: boolean;
    };

    expect(result.ok).toBe(true);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('falls back to a lowercased email lookup', async () => {
    mocks.findAll
      .mockResolvedValueOnce([]) // exact (mixed-case) miss
      .mockResolvedValueOnce([manageable]); // lowercased hit
    mocks.createAccessToken.mockResolvedValue('tok');

    await run({ email: 'Family@Example.com' });

    expect(mocks.findAll).toHaveBeenNthCalledWith(1, {
      email: 'Family@Example.com',
    });
    expect(mocks.findAll).toHaveBeenNthCalledWith(2, {
      email: EMAIL,
    });
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing email', async () => {
    await expect(run({})).rejects.toThrow(/Email is required/);
  });
});
