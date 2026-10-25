import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for `getRegistrationStatus`: a confirmed private-hour booking
 * carries the hour it holds; a seat booking carries none.
 */

const mocks = vi.hoisted(() => ({
  regFindById: vi.fn(),
  classFindById: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  RegistrationRepository: { findById: mocks.regFindById },
  ClassRepository: { findById: mocks.classFindById },
}));

import { getRegistrationStatus } from './get-registration-status';

const confirmed = {
  id: 'reg-1',
  classId: 'class-ph',
  status: 'confirmed',
  confirmationNumber: 'MS-ABCDEF',
  customerName: 'Robin Ashfield',
  customerEmail: 'robin@example.com',
  quantity: 1,
  pricePaidCents: 6360,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.classFindById.mockResolvedValue({ name: 'Private Pottery Hour' });
});

describe('getRegistrationStatus', () => {
  it('includes the booked hour as ISO for a private hour', async () => {
    mocks.regFindById.mockResolvedValue({
      ...confirmed,
      slotStart: new Date('2030-06-15T14:00:00.000Z'),
      groupSize: 5,
    });

    const result = await getRegistrationStatus({ registrationId: 'reg-1' });

    expect(result.status).toBe('confirmed');
    expect(result.confirmation).toMatchObject({
      className: 'Private Pottery Hour',
      quantity: 1,
      slotStart: '2030-06-15T14:00:00.000Z',
    });
  });

  it('leaves slotStart out for a seat registration', async () => {
    mocks.regFindById.mockResolvedValue(confirmed);

    const result = await getRegistrationStatus({ registrationId: 'reg-1' });

    expect(result.confirmation?.slotStart).toBeUndefined();
  });

  it('returns only the status for an unconfirmed hold', async () => {
    mocks.regFindById.mockResolvedValue({
      ...confirmed,
      status: 'pending',
      slotStart: new Date('2030-06-15T14:00:00.000Z'),
    });

    expect(await getRegistrationStatus({ registrationId: 'reg-1' })).toEqual({
      status: 'pending',
    });
  });
});
