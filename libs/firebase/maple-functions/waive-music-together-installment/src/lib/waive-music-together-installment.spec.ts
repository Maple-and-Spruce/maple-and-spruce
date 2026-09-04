import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown) => Promise<unknown>)
    | null,
  chargeFindById: vi.fn(),
  chargeTryWaive: vi.fn(),
  regFindById: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  const endpoint = {
    usingSecrets: vi.fn(() => endpoint),
    usingStrings: vi.fn(() => endpoint),
    requiringRole: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-fn';
    }),
  };
  return {
    Functions: { endpoint },
    Role: { Admin: 'admin', MtTeacher: 'mt-teacher' },
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwNotFound: (e: string, id: string) => {
      throw new HttpsError('not-found', `${e} not found: ${id}`);
    },
    throwFailedPrecondition: (m: string) => {
      throw new HttpsError('failed-precondition', m);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherScheduledChargeRepository: {
    findById: mocks.chargeFindById,
    tryWaive: mocks.chargeTryWaive,
  },
  MusicTogetherRegistrationRepository: {
    findById: mocks.regFindById,
  },
}));

import './waive-music-together-installment';

const scheduledCharge = {
  id: 'charge-1',
  registrationId: 'reg-1',
  sectionId: 'sec-1',
  installmentNumber: 2,
  amountCents: 13200,
  status: 'scheduled',
};

const confirmedRegistration = { id: 'reg-1', status: 'confirmed' };

const call = (data: unknown, uid = 'admin-uid') =>
  mocks.capturedHandler!(data, { uid });

describe('waiveMusicTogetherInstallment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chargeFindById.mockResolvedValue(scheduledCharge);
    mocks.regFindById.mockResolvedValue(confirmedRegistration);
    mocks.chargeTryWaive.mockResolvedValue({
      ...scheduledCharge,
      status: 'waived',
    });
  });

  it('waives a scheduled charge and reports the amount never taken', async () => {
    const result = await call({ chargeId: 'charge-1', reason: 'Pilot half-off' });

    expect(result).toEqual({
      chargeId: 'charge-1',
      status: 'waived',
      amountCents: 13200,
    });
    expect(mocks.chargeTryWaive).toHaveBeenCalledWith(
      'charge-1',
      'Pilot half-off',
      'admin-uid'
    );
  });

  it('records who waived it, so a comped charge is never anonymous', async () => {
    await call({ chargeId: 'charge-1' }, 'stephanie-uid');

    expect(mocks.chargeTryWaive).toHaveBeenCalledWith(
      'charge-1',
      'Waived by an administrator',
      'stephanie-uid'
    );
  });

  it('requires a charge id', async () => {
    await expect(call({})).rejects.toThrow('Charge ID is required');
    expect(mocks.chargeTryWaive).not.toHaveBeenCalled();
  });

  it('rejects an over-long reason', async () => {
    await expect(
      call({ chargeId: 'charge-1', reason: 'x'.repeat(501) })
    ).rejects.toThrow('500 characters or fewer');
    expect(mocks.chargeTryWaive).not.toHaveBeenCalled();
  });

  it('404s an unknown charge', async () => {
    mocks.chargeFindById.mockResolvedValue(undefined);

    await expect(call({ chargeId: 'nope' })).rejects.toThrow('not found');
    expect(mocks.chargeTryWaive).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'refunded'])(
    'refuses to waive on a %s registration (charges are already cancelled)',
    async (status) => {
      mocks.regFindById.mockResolvedValue({ id: 'reg-1', status });

      await expect(call({ chargeId: 'charge-1' })).rejects.toThrow(
        'already cancelled'
      );
      expect(mocks.chargeTryWaive).not.toHaveBeenCalled();
    }
  );

  it('tells the admin to refund when the charge was already taken', async () => {
    // Lost the race with the charge job between the read and the transaction.
    mocks.chargeTryWaive.mockResolvedValue(undefined);
    mocks.chargeFindById
      .mockResolvedValueOnce(scheduledCharge)
      .mockResolvedValueOnce({ ...scheduledCharge, status: 'paid' });

    await expect(call({ chargeId: 'charge-1' })).rejects.toThrow(
      'Issue a refund instead'
    );
  });

  it('reports the blocking status when the charge is mid-flight', async () => {
    mocks.chargeTryWaive.mockResolvedValue(undefined);
    mocks.chargeFindById
      .mockResolvedValueOnce(scheduledCharge)
      .mockResolvedValueOnce({ ...scheduledCharge, status: 'charging' });

    await expect(call({ chargeId: 'charge-1' })).rejects.toThrow(
      'status: charging'
    );
  });
});
