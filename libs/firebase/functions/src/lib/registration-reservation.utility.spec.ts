import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for `reserveClassRegistration`, focused on the private-hours
 * path: one group books one hour, the hour must be a future session, and one
 * active registration holds an hour. The seat path is checked alongside so
 * the hour logic can't leak into it.
 *
 * Repositories and the Firestore transaction are mocked (ADR-017); the domain
 * helpers and validation suite are real.
 */

const mocks = vi.hoisted(() => ({
  findClass: vi.fn(),
  findRequired: vi.fn(),
  findDiscount: vi.fn(),
  txnGet: vi.fn(),
  txnSet: vi.fn(),
  txnUpdate: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ increment: n }) },
}));

vi.mock('@maple/firebase/database', () => {
  const query = { where: () => query };
  return {
    ClassRepository: { findById: mocks.findClass },
    DiscountRepository: {
      findByCode: mocks.findDiscount,
      getDocRef: (id: string) => ({ id }),
    },
    RegistrationRepository: { getDocRef: () => ({ id: 'reg-new' }) },
    AgreementTemplateRepository: {
      findRequiredForCategory: mocks.findRequired,
    },
    getDb: () => ({
      collection: () => query,
      runTransaction: async (fn: (txn: unknown) => Promise<unknown>) =>
        fn({ get: mocks.txnGet, set: mocks.txnSet, update: mocks.txnUpdate }),
    }),
  };
});

import { reserveClassRegistration } from './registration-reservation.utility';
import type { RegistrationReservationInput } from './registration-reservation.utility';
import type { Class } from '@maple/ts/domain';

const NOW = new Date('2030-06-01T12:00:00Z');
// Saturday 2030-06-15, 10 and 11 AM Eastern (EDT = UTC-4).
const HOUR_10 = new Date('2030-06-15T14:00:00Z');
const HOUR_11 = new Date('2030-06-15T15:00:00Z');
// An hour that has already started.
const PAST_HOUR = new Date('2030-05-25T14:00:00Z');

function privateHoursClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'class-ph',
    name: 'Private Pottery Hour',
    description: 'Your group, our studio.',
    sessions: [{ dateTime: PAST_HOUR }, { dateTime: HOUR_10 }, { dateTime: HOUR_11 }],
    format: 'privateHours',
    durationMinutes: 60,
    capacity: 8,
    priceCents: 6000,
    skillLevel: 'all-levels',
    status: 'published',
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-01T00:00:00Z'),
    ...overrides,
  } as Class;
}

function seatClass(overrides: Partial<Class> = {}): Class {
  return privateHoursClass({
    id: 'class-seats',
    name: 'Wheel Throwing',
    format: undefined,
    sessions: [{ dateTime: HOUR_10 }],
    capacity: 2,
    priceCents: 4500,
    ...overrides,
  });
}

function request(
  overrides: Partial<RegistrationReservationInput> = {}
): RegistrationReservationInput {
  return {
    classId: 'class-ph',
    customerEmail: 'robin@example.com',
    customerName: 'Robin Ashfield',
    customerPhone: '+15550000101',
    quantity: 1,
    slotStart: HOUR_10.toISOString(),
    groupSize: 5,
    ...overrides,
  } as RegistrationReservationInput;
}

/** A transaction query snapshot over the given active registrations. */
function snapshot(docs: Array<Record<string, unknown>>) {
  return { docs: docs.map((d) => ({ data: () => d })) };
}

/** A Firestore Timestamp stand-in. */
function timestamp(d: Date) {
  return { toDate: () => d };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.findClass.mockResolvedValue(privateHoursClass());
  mocks.findRequired.mockResolvedValue([]);
  mocks.txnGet.mockResolvedValue(snapshot([]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reserveClassRegistration: private hours', () => {
  it('requires a slotStart', async () => {
    await expect(
      reserveClassRegistration(request({ slotStart: undefined }), 6)
    ).rejects.toThrow('Pick a time for your group');
    expect(mocks.txnSet).not.toHaveBeenCalled();
  });

  it('rejects an hour that is not one of the sessions', async () => {
    await expect(
      reserveClassRegistration(
        request({ slotStart: '2030-06-15T14:30:00.000Z' }),
        6
      )
    ).rejects.toThrow('That time is no longer available');
    expect(mocks.txnSet).not.toHaveBeenCalled();
  });

  it('rejects an hour that has already started', async () => {
    await expect(
      reserveClassRegistration(
        request({ slotStart: PAST_HOUR.toISOString() }),
        6
      )
    ).rejects.toThrow('That time is no longer available');
  });

  it('rejects a quantity other than 1', async () => {
    await expect(
      reserveClassRegistration(request({ quantity: 3 }), 6)
    ).rejects.toThrow('booked once for the whole group');
  });

  it('rejects additional attendees', async () => {
    await expect(
      reserveClassRegistration(
        request({ quantity: 2, additionalAttendees: [{ name: 'Sam Doe' }] }),
        6
      )
    ).rejects.toThrow('booked once for the whole group');
  });

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['over the largest group', 9],
  ])('rejects a group size that is %s', async (_label, groupSize) => {
    await expect(
      reserveClassRegistration(request({ groupSize }), 6)
    ).rejects.toThrow(/Group size must be between 1 and 8|groupSize/);
    expect(mocks.txnSet).not.toHaveBeenCalled();
  });

  it('accepts a group of exactly the capacity', async () => {
    await expect(
      reserveClassRegistration(request({ groupSize: 8 }), 6)
    ).resolves.toMatchObject({ registrationId: 'reg-new' });
  });

  it('rejects an hour another active registration holds (Timestamp)', async () => {
    mocks.txnGet.mockResolvedValue(
      snapshot([{ quantity: 1, status: 'pending', slotStart: timestamp(HOUR_10) }])
    );
    await expect(reserveClassRegistration(request(), 6)).rejects.toThrow(
      'That time was just booked'
    );
    expect(mocks.txnSet).not.toHaveBeenCalled();
  });

  it('rejects an hour another active registration holds (plain Date)', async () => {
    mocks.txnGet.mockResolvedValue(
      snapshot([{ quantity: 1, status: 'confirmed', slotStart: new Date(HOUR_10) }])
    );
    await expect(reserveClassRegistration(request(), 6)).rejects.toThrow(
      'That time was just booked'
    );
  });

  it('books an hour when a different hour is held, writing slotStart and groupSize', async () => {
    // More registrations than the group capacity would allow for seats: hours
    // never compare against `capacity`.
    mocks.txnGet.mockResolvedValue(
      snapshot([
        { quantity: 1, slotStart: timestamp(HOUR_11) },
        ...Array.from({ length: 9 }, () => ({ quantity: 1, slotStart: null })),
      ])
    );

    const result = await reserveClassRegistration(request(), 6);

    expect(result.subtotalCents).toBe(6000);
    expect(result.taxAmountCents).toBe(360);
    expect(result.pricePaidCents).toBe(6360);
    expect(mocks.txnSet).toHaveBeenCalledTimes(1);
    const payload = mocks.txnSet.mock.calls[0][1];
    expect(payload.slotStart).toBeInstanceOf(Date);
    expect((payload.slotStart as Date).getTime()).toBe(HOUR_10.getTime());
    expect(payload).toMatchObject({
      groupSize: 5,
      quantity: 1,
      status: 'pending',
      pricePaidCents: 6360,
      additionalAttendees: null,
    });
  });
});

describe('reserveClassRegistration: seats', () => {
  beforeEach(() => {
    mocks.findClass.mockResolvedValue(seatClass());
  });

  const seatRequest = (overrides: Partial<RegistrationReservationInput> = {}) =>
    request({
      classId: 'class-seats',
      slotStart: undefined,
      groupSize: undefined,
      ...overrides,
    });

  it('rejects a slotStart on a seat class', async () => {
    await expect(
      reserveClassRegistration(
        seatRequest({ slotStart: HOUR_10.toISOString() }),
        6
      )
    ).rejects.toThrow('booked by the seat');
  });

  it('rejects a groupSize on a seat class', async () => {
    await expect(
      reserveClassRegistration(seatRequest({ groupSize: 3 }), 6)
    ).rejects.toThrow('booked by the seat');
  });

  it('still throws "This class is full" when every seat is taken', async () => {
    mocks.txnGet.mockResolvedValue(
      snapshot([{ quantity: 1 }, { quantity: 1 }])
    );
    await expect(reserveClassRegistration(seatRequest(), 6)).rejects.toThrow(
      'This class is full'
    );
    expect(mocks.txnSet).not.toHaveBeenCalled();
  });

  it('prices per seat and writes null slotStart/groupSize', async () => {
    const result = await reserveClassRegistration(
      seatRequest({ quantity: 2 }),
      0
    );
    expect(result.pricePaidCents).toBe(9000);
    const payload = mocks.txnSet.mock.calls[0][1];
    expect(payload).toMatchObject({ slotStart: null, groupSize: null, quantity: 2 });
  });
});
