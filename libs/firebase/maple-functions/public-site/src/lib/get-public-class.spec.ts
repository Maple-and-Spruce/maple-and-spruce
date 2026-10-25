import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class } from '@maple/ts/domain';

/**
 * Unit tests for `getPublicClass`: a private-hours class reports which hours
 * are taken and counts open hours; a seat class is unchanged.
 */

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  countByClassId: vi.fn(),
  findHeldSlotStarts: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: { findById: mocks.classFindById },
  InstructorRepository: { findById: vi.fn() },
  ClassCategoryRepository: { findById: vi.fn() },
  RegistrationRepository: {
    countByClassId: mocks.countByClassId,
    findHeldSlotStarts: mocks.findHeldSlotStarts,
  },
}));

import { getPublicClass } from './get-public-class';

const HOURS = [
  new Date('2030-06-15T14:00:00.000Z'),
  new Date('2030-06-15T15:00:00.000Z'),
  new Date('2030-06-15T16:00:00.000Z'),
  new Date('2030-06-16T14:00:00.000Z'),
];

const privateClass: Class = {
  id: 'class-ph',
  name: 'Private Pottery Hour',
  description: 'Your group has the studio to itself for an hour.',
  sessions: HOURS.map((dateTime) => ({ dateTime })),
  format: 'privateHours',
  durationMinutes: 60,
  capacity: 8,
  priceCents: 6000,
  skillLevel: 'all-levels',
  status: 'published',
  createdAt: new Date('2030-01-01T00:00:00Z'),
  updatedAt: new Date('2030-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPublicClass', () => {
  it('returns the held hours and counts open hours for a private-hours class', async () => {
    mocks.classFindById.mockResolvedValue(privateClass);
    mocks.countByClassId.mockResolvedValue(2);
    mocks.findHeldSlotStarts.mockResolvedValue([HOURS[0], HOURS[2]]);

    const { class: result } = await getPublicClass({ id: 'class-ph' });

    expect(mocks.findHeldSlotStarts).toHaveBeenCalledWith('class-ph');
    expect(result.format).toBe('privateHours');
    expect(result.bookedSlotStarts).toEqual([
      '2030-06-15T14:00:00.000Z',
      '2030-06-15T16:00:00.000Z',
    ]);
    expect(result.spotsRemaining).toBe(2);
    expect(result.capacity).toBe(8);
  });

  it('counts open hours from the held hours, so a fully held class reads full', async () => {
    mocks.classFindById.mockResolvedValue(privateClass);
    mocks.countByClassId.mockResolvedValue(5);
    mocks.findHeldSlotStarts.mockResolvedValue(
      privateClass.sessions.map((s: { dateTime: Date }) => s.dateTime)
    );

    const { class: result } = await getPublicClass({ id: 'class-ph' });

    expect(result.spotsRemaining).toBe(0);
  });

  it('does not look up held hours for a seat class', async () => {
    mocks.classFindById.mockResolvedValue({
      ...privateClass,
      id: 'class-seats',
      format: undefined,
      capacity: 10,
    });
    mocks.countByClassId.mockResolvedValue(3);

    const { class: result } = await getPublicClass({ id: 'class-seats' });

    expect(mocks.findHeldSlotStarts).not.toHaveBeenCalled();
    expect(result.spotsRemaining).toBe(7);
    expect(result.format).toBeUndefined();
    expect(result.bookedSlotStarts).toBeUndefined();
  });
});
