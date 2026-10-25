import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Class } from '@maple/ts/domain';

/**
 * Unit tests for `updateClass`, focused on the private-hours guard: an hour
 * an active registration holds can't be edited away.
 */

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  classUpdate: vi.fn(),
  findHeldSlotStarts: vi.fn(),
}));

vi.mock('@maple/firebase/functions', async () => {
  const actual = await vi.importActual<typeof import('@maple/firebase/functions')>(
    '@maple/firebase/functions'
  );
  return {
    ...actual,
    createAdminFunction: <TReq, TRes>(
      handler: (data: TReq, ctx: unknown) => Promise<TRes>
    ) => handler,
  };
});

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findById: mocks.classFindById,
    update: mocks.classUpdate,
  },
  RegistrationRepository: { findHeldSlotStarts: mocks.findHeldSlotStarts },
}));

import { updateClass } from './update-class';

type Handler = (
  data: Partial<Class> & { id: string },
  ctx?: unknown
) => Promise<{ class: Class }>;
const handler = updateClass as unknown as Handler;

// Saturday 2030-06-15 in Eastern time (EDT = UTC-4).
const HOUR_10 = new Date('2030-06-15T14:00:00Z');
const HOUR_11 = new Date('2030-06-15T15:00:00Z');
const HOUR_13 = new Date('2030-06-15T17:00:00Z');

const privateClass: Class = {
  id: 'class-ph',
  name: 'Private Pottery Hour',
  description: 'Your group has the studio to itself for an hour.',
  sessions: [{ dateTime: HOUR_10 }, { dateTime: HOUR_11 }],
  format: 'privateHours',
  durationMinutes: 60,
  capacity: 8,
  priceCents: 6000,
  skillLevel: 'all-levels',
  status: 'published',
  instructorId: 'instr-1',
  createdAt: new Date('2030-01-01T00:00:00Z'),
  updatedAt: new Date('2030-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.classFindById.mockResolvedValue(privateClass);
  mocks.classUpdate.mockImplementation(async (data) => ({
    ...privateClass,
    ...data,
  }));
  mocks.findHeldSlotStarts.mockResolvedValue([]);
});

describe('updateClass: private hours', () => {
  it('refuses to remove an hour a registration holds, naming the hour', async () => {
    mocks.findHeldSlotStarts.mockResolvedValue([new Date(HOUR_11)]);

    const error = await handler({
      id: 'class-ph',
      sessions: [{ dateTime: HOUR_10 }],
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('invalid-argument');
    expect((error as HttpsError).message).toContain("can't be removed");
    expect((error as HttpsError).message).toContain('Sat, Jun 15, 11:00');
    expect(mocks.findHeldSlotStarts).toHaveBeenCalledWith('class-ph');
    expect(mocks.classUpdate).not.toHaveBeenCalled();
  });

  it('removes an hour nobody holds', async () => {
    mocks.findHeldSlotStarts.mockResolvedValue([new Date(HOUR_10)]);

    await handler({ id: 'class-ph', sessions: [{ dateTime: HOUR_10 }] });

    expect(mocks.classUpdate).toHaveBeenCalledWith({
      id: 'class-ph',
      sessions: [{ dateTime: HOUR_10 }],
    });
  });

  it('adds hours while keeping the held ones', async () => {
    mocks.findHeldSlotStarts.mockResolvedValue([
      new Date(HOUR_10),
      new Date(HOUR_11),
    ]);
    const sessions = [
      { dateTime: HOUR_10 },
      { dateTime: HOUR_11 },
      { dateTime: HOUR_13 },
    ];

    await handler({ id: 'class-ph', sessions });

    expect(mocks.classUpdate).toHaveBeenCalledWith({ id: 'class-ph', sessions });
  });

  it('matches held hours sent back as ISO strings', async () => {
    mocks.findHeldSlotStarts.mockResolvedValue([new Date(HOUR_11)]);

    await handler({
      id: 'class-ph',
      sessions: [
        { dateTime: HOUR_10.toISOString() as unknown as Date },
        { dateTime: HOUR_11.toISOString() as unknown as Date },
      ],
    });

    expect(mocks.classUpdate).toHaveBeenCalled();
  });

  it('skips the check when the edit leaves sessions alone', async () => {
    await handler({ id: 'class-ph', name: 'Private Clay Hour' });

    expect(mocks.findHeldSlotStarts).not.toHaveBeenCalled();
    expect(mocks.classUpdate).toHaveBeenCalled();
  });
});

describe('updateClass: seats', () => {
  it('never looks up held hours for a seat class', async () => {
    mocks.classFindById.mockResolvedValue({
      ...privateClass,
      id: 'class-seats',
      format: 'seats',
    });

    await handler({ id: 'class-seats', sessions: [{ dateTime: HOUR_13 }] });

    expect(mocks.findHeldSlotStarts).not.toHaveBeenCalled();
    expect(mocks.classUpdate).toHaveBeenCalled();
  });
});
