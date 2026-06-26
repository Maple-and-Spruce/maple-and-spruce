import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./utilities/database.config', () => ({
  db: {
    collection: () => ({
      add: mocks.add,
      where: () => ({ limit: () => ({ get: mocks.get }) }),
    }),
  },
  toDate: (value: unknown): Date =>
    value instanceof Date ? value : new Date(value as string),
}));

import { CraftClubTokenRepository } from './craft-club-token.repository';

const HEX64 = /^[0-9a-f]{64}$/;

function snapshot(data: Record<string, unknown> | null) {
  return data === null
    ? { empty: true, docs: [] }
    : { empty: false, docs: [{ data: () => data, ref: { update: mocks.update } }] };
}

describe('CraftClubTokenRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('createAccessToken', () => {
    it('returns a raw hex token but persists only its hash', async () => {
      const raw = await CraftClubTokenRepository.createAccessToken(
        '  Member@Example.COM '
      );
      expect(raw).toMatch(HEX64);
      const stored = mocks.add.mock.calls[0][0];
      expect(stored.tokenHash).toMatch(HEX64);
      expect(stored.tokenHash).not.toBe(raw); // hash, not the raw token
      expect(stored.email).toBe('member@example.com');
      expect(stored.usedAt).toBeNull();
    });
  });

  describe('consumeAccessToken', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);

    it('returns the email and marks the token used when valid', async () => {
      mocks.get.mockResolvedValue(
        snapshot({ email: 'm@e.com', expiresAt: future, usedAt: null })
      );
      const email = await CraftClubTokenRepository.consumeAccessToken('tok');
      expect(email).toBe('m@e.com');
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({ usedAt: expect.any(Date) })
      );
    });

    it('refuses an already-used token', async () => {
      mocks.get.mockResolvedValue(
        snapshot({ email: 'm@e.com', expiresAt: future, usedAt: new Date() })
      );
      expect(await CraftClubTokenRepository.consumeAccessToken('tok')).toBeUndefined();
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('refuses an expired token', async () => {
      mocks.get.mockResolvedValue(
        snapshot({ email: 'm@e.com', expiresAt: past, usedAt: null })
      );
      expect(await CraftClubTokenRepository.consumeAccessToken('tok')).toBeUndefined();
    });

    it('refuses an unknown token', async () => {
      mocks.get.mockResolvedValue(snapshot(null));
      expect(await CraftClubTokenRepository.consumeAccessToken('tok')).toBeUndefined();
    });
  });

  describe('sessions', () => {
    it('createSession persists a hash + memberId and returns a raw token', async () => {
      const raw = await CraftClubTokenRepository.createSession('member-1');
      expect(raw).toMatch(HEX64);
      const stored = mocks.add.mock.calls[0][0];
      expect(stored.memberId).toBe('member-1');
      expect(stored.tokenHash).toMatch(HEX64);
      expect(stored.tokenHash).not.toBe(raw);
    });

    it('resolveSession returns the memberId when valid and undefined when expired', async () => {
      mocks.get.mockResolvedValueOnce(
        snapshot({ memberId: 'm1', expiresAt: new Date(Date.now() + 60_000) })
      );
      expect(await CraftClubTokenRepository.resolveSession('s')).toBe('m1');

      mocks.get.mockResolvedValueOnce(
        snapshot({ memberId: 'm1', expiresAt: new Date(Date.now() - 60_000) })
      );
      expect(await CraftClubTokenRepository.resolveSession('s')).toBeUndefined();
    });

    it('resolveSession returns undefined for an empty/blank token', async () => {
      expect(await CraftClubTokenRepository.resolveSession('')).toBeUndefined();
    });
  });
});
