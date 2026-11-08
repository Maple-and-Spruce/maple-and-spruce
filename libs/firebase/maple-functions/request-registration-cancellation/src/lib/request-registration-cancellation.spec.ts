import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Functions } from '@maple/firebase/functions';

const mocks = vi.hoisted(() => ({
  findByConfirmationNumber: vi.fn(),
  markCancellationRequested: vi.fn(),
  findClass: vi.fn(),
  queueMail: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const endpoint: Record<string, unknown> = {
    withAppCheck: (mode: string) => {
      endpoint['appCheckMode'] = mode;
      return endpoint;
    },
    throttling: (scope: string, rules: unknown) => {
      endpoint['throttle'] = { scope, rules };
      return endpoint;
    },
    usingStrings: (...names: string[]) => {
      endpoint['strings'] = names;
      return endpoint;
    },
    handle: vi.fn(() => 'mock-function'),
  };
  return {
    Functions: { endpoint },
    emailLinkThrottles: () => ['ip', 'email'],
    queueMail: mocks.queueMail,
    throwInvalidArgument: (m: string) => {
      throw new Error(`invalid-argument: ${m}`);
    },
    throwFailedPrecondition: (m: string) => {
      throw new Error(`failed-precondition: ${m}`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  RegistrationRepository: {
    findByConfirmationNumber: mocks.findByConfirmationNumber,
    markCancellationRequested: mocks.markCancellationRequested,
  },
  ClassRepository: { findById: mocks.findClass },
}));

import { handleRequestRegistrationCancellation } from './request-registration-cancellation';
import { lookupRegistrationForCancellationAt as lookupRegistrationForCancellation } from './find-registration-for-cancellation';

const STRINGS = {
  ADMIN_ALERT_EMAIL: 'staff@example.com',
  ADMIN_PORTAL_URL: 'https://admin.example.com',
};

// Class on Sat Dec 5 2026 at 10:00 AM Eastern → free until Sat Nov 21, 10:00 AM.
const CLASS = {
  id: 'cls-1',
  name: 'Wheel Pottery',
  sessions: [{ dateTime: new Date('2026-12-05T15:00:00.000Z') }],
  durationMinutes: 120,
};
const BEFORE = new Date('2026-11-20T12:00:00.000Z');
const AFTER = new Date('2026-11-22T12:00:00.000Z');

const registration = (overrides: Record<string, unknown> = {}) => ({
  id: 'reg-1',
  classId: 'cls-1',
  customerName: 'Robin Ashfield',
  customerEmail: 'Robin@Example.com',
  confirmationNumber: 'MS-ABC234',
  quantity: 2,
  pricePaidCents: 12720,
  status: 'confirmed',
  source: 'web',
  ...overrides,
});

const ASK = { confirmationNumber: ' ms-abc234 ', email: 'robin@example.com ' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findByConfirmationNumber.mockResolvedValue([registration()]);
  mocks.findClass.mockResolvedValue(CLASS);
  mocks.markCancellationRequested.mockResolvedValue(true);
  mocks.queueMail.mockResolvedValue(true);
});

describe('lookupRegistrationForCancellation', () => {
  it('finds by tidied number and any-case email, with the deadline ahead', async () => {
    const result = await lookupRegistrationForCancellation(ASK, BEFORE);
    expect(mocks.findByConfirmationNumber).toHaveBeenCalledWith('MS-ABC234');
    expect(result).toEqual({
      found: true,
      className: 'Wheel Pottery',
      startsAt: '2026-12-05T15:00:00.000Z',
      freeCancellationUntil: '2026-11-21T15:00:00.000Z',
      cancellationRequested: false,
    });
  });

  it('leaves the deadline out once it has passed', async () => {
    const result = await lookupRegistrationForCancellation(ASK, AFTER);
    expect(result).toMatchObject({ found: true, className: 'Wheel Pottery' });
    expect(result).not.toHaveProperty('freeCancellationUntil', expect.anything());
  });

  it('says when they already asked', async () => {
    mocks.findByConfirmationNumber.mockResolvedValue([
      registration({ cancellationRequestedAt: new Date() }),
    ]);
    expect(await lookupRegistrationForCancellation(ASK, BEFORE)).toMatchObject({
      cancellationRequested: true,
    });
  });

  it.each([
    ['a different email', registration({ customerEmail: 'someone@example.com' })],
    ['a cancelled registration', registration({ status: 'cancelled' })],
    ['a refunded registration', registration({ status: 'refunded' })],
    ['a register sale', registration({ source: 'pos' })],
  ])('is not found for %s', async (_label, reg) => {
    mocks.findByConfirmationNumber.mockResolvedValue([reg]);
    expect(await lookupRegistrationForCancellation(ASK, BEFORE)).toEqual({ found: false });
  });

  it('is not found without both fields, and reads nothing', async () => {
    expect(
      await lookupRegistrationForCancellation({ confirmationNumber: 'MS-ABC234', email: ' ' }, BEFORE)
    ).toEqual({ found: false });
    expect(
      await lookupRegistrationForCancellation({ confirmationNumber: '', email: 'a@example.com' }, BEFORE)
    ).toEqual({ found: false });
    expect(mocks.findByConfirmationNumber).not.toHaveBeenCalled();
  });

  it('counts a private group from its own hour', async () => {
    mocks.findByConfirmationNumber.mockResolvedValue([
      registration({ slotStart: new Date('2026-12-19T15:00:00.000Z') }),
    ]);
    expect(await lookupRegistrationForCancellation(ASK, AFTER)).toMatchObject({
      startsAt: '2026-12-19T15:00:00.000Z',
      freeCancellationUntil: '2026-12-05T15:00:00.000Z',
    });
  });
});

describe('requestRegistrationCancellation', () => {
  it('records the request and emails Katie and the customer', async () => {
    const result = await handleRequestRegistrationCancellation(ASK, STRINGS, BEFORE);

    expect(result).toEqual({ ok: true, freeCancellationUntil: '2026-11-21T15:00:00.000Z' });
    expect(mocks.markCancellationRequested).toHaveBeenCalledWith('reg-1', BEFORE);
    expect(mocks.queueMail).toHaveBeenCalledTimes(2);
    expect(mocks.queueMail).toHaveBeenCalledWith({
      to: 'staff@example.com',
      templateName: 'registration-cancellation-request-staff',
      sender: 'maple-spruce',
      data: expect.objectContaining({
        className: 'Wheel Pottery',
        customerName: 'Robin Ashfield',
        customerEmail: 'Robin@Example.com',
        confirmationNumber: 'MS-ABC234',
        quantity: 2,
        amountPaid: '$127.20',
        freeCancellationUntil: 'Sat, Nov 21 at 10:00 AM',
        rosterUrl: 'https://admin.example.com/classes/cls-1/roster',
      }),
    });
    expect(mocks.queueMail).toHaveBeenCalledWith({
      to: 'Robin@Example.com',
      templateName: 'registration-cancellation-requested',
      sender: 'maple-spruce',
      data: expect.objectContaining({
        className: 'Wheel Pottery',
        confirmationNumber: 'MS-ABC234',
        freeCancellationUntil: 'Sat, Nov 21 at 10:00 AM',
      }),
    });
  });

  it('a second ask is answered the same and sends nothing', async () => {
    mocks.markCancellationRequested.mockResolvedValue(false);
    const result = await handleRequestRegistrationCancellation(ASK, STRINGS, BEFORE);
    expect(result.ok).toBe(true);
    expect(mocks.queueMail).not.toHaveBeenCalled();
  });

  it('refuses after the deadline and records nothing', async () => {
    await expect(
      handleRequestRegistrationCancellation(ASK, STRINGS, AFTER)
    ).rejects.toThrow(/failed-precondition/);
    expect(mocks.markCancellationRequested).not.toHaveBeenCalled();
    expect(mocks.queueMail).not.toHaveBeenCalled();
  });

  it('refuses a booking that does not match, the same way', async () => {
    mocks.findByConfirmationNumber.mockResolvedValue([]);
    await expect(
      handleRequestRegistrationCancellation(ASK, STRINGS, BEFORE)
    ).rejects.toThrow(/failed-precondition/);
  });

  it('requires both fields', async () => {
    await expect(
      handleRequestRegistrationCancellation({ confirmationNumber: '', email: 'a@example.com' }, STRINGS, BEFORE)
    ).rejects.toThrow(/invalid-argument/);
    await expect(
      handleRequestRegistrationCancellation({ confirmationNumber: 'MS-ABC234', email: '' }, STRINGS, BEFORE)
    ).rejects.toThrow(/invalid-argument/);
  });

  it('a failed email does not fail the recorded request', async () => {
    mocks.queueMail.mockRejectedValue(new Error('mail down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      handleRequestRegistrationCancellation(ASK, STRINGS, BEFORE)
    ).resolves.toMatchObject({ ok: true });
  });

  it('opts into App Check, email-link throttles and the staff strings', () => {
    const endpoint = Functions.endpoint as unknown as Record<string, unknown>;
    expect(endpoint['appCheckMode']).toBe('enforce');
    expect(endpoint['throttle']).toEqual({
      scope: 'requestRegistrationCancellation',
      rules: ['ip', 'email'],
    });
    expect(endpoint['strings']).toEqual(['ADMIN_ALERT_EMAIL', 'ADMIN_PORTAL_URL']);
  });
});
