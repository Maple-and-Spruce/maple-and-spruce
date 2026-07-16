import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumeAccessToken: vi.fn(),
  createSession: vi.fn(),
  findRegistrationById: vi.fn(),
  findSectionById: vi.fn(),
  findByRegistrationId: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createPublicFunction: <TReq, TRes>(handler: (d: TReq) => Promise<TRes>) =>
    handler,
  throwInvalidArgument: (m: string) => {
    throw new Error(m);
  },
  throwFailedPrecondition: (m: string) => {
    throw new Error(m);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherTokenRepository: {
    consumeAccessToken: mocks.consumeAccessToken,
    createSession: mocks.createSession,
  },
  MusicTogetherRegistrationRepository: {
    findById: mocks.findRegistrationById,
  },
  MusicTogetherSectionRepository: { findById: mocks.findSectionById },
  MusicTogetherScheduledChargeRepository: {
    findByRegistrationId: mocks.findByRegistrationId,
  },
}));

import { startMusicTogetherManageSession } from './start-music-together-manage-session';

type Handler = (data: unknown) => Promise<{
  sessionToken: string;
  registration: Record<string, unknown>;
}>;
const handler = startMusicTogetherManageSession as unknown as Handler;

const registration = {
  id: 'reg-1',
  sectionId: 'sec-1',
  parentNames: ['Ada Lovelace'],
  adultFirstName: 'Ada',
  adultLastName: 'Lovelace',
  email: 'ada@e.com',
  paymentPlan: 'installments',
  status: 'confirmed',
  squareCustomerId: 'cust-secret',
  squareCardId: 'card-secret',
};

describe('startMusicTogetherManageSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exchanges a valid token for a session and a customer-safe view', async () => {
    mocks.consumeAccessToken.mockResolvedValue('reg-1');
    mocks.findRegistrationById.mockResolvedValue(registration);
    mocks.findSectionById.mockResolvedValue({ id: 'sec-1', name: 'Fall Babies' });
    mocks.findByRegistrationId.mockResolvedValue([
      {
        id: 'c2',
        amountCents: 9500,
        dueAt: new Date('2026-09-15T13:00:00Z'),
        status: 'scheduled',
      },
    ]);
    mocks.createSession.mockResolvedValue('session-token-xyz');

    const result = await handler({ token: 'magic' });

    expect(mocks.createSession).toHaveBeenCalledWith('reg-1');
    expect(result.sessionToken).toBe('session-token-xyz');
    expect(result.registration).toMatchObject({
      registrationId: 'reg-1',
      sectionName: 'Fall Babies',
      parentName: 'Ada Lovelace',
    });
    expect(
      (result.registration.nextInstallment as Record<string, unknown>)
        .amountLabel
    ).toBe('$95.00');
    // Public view must NOT leak Square identifiers.
    expect(result.registration).not.toHaveProperty('squareCardId');
    expect(result.registration).not.toHaveProperty('squareCustomerId');
  });

  it('rejects a missing token', async () => {
    await expect(handler({})).rejects.toThrow(/Token is required/);
  });

  it('rejects an invalid or expired token', async () => {
    mocks.consumeAccessToken.mockResolvedValue(undefined);
    await expect(handler({ token: 'bad' })).rejects.toThrow(
      /invalid or has expired/
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('rejects when the registration is cancelled', async () => {
    mocks.consumeAccessToken.mockResolvedValue('reg-1');
    mocks.findRegistrationById.mockResolvedValue({
      ...registration,
      status: 'cancelled',
    });
    await expect(handler({ token: 'magic' })).rejects.toThrow(
      /can no longer be managed/i
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
