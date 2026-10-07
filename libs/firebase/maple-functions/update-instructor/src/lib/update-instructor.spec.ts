import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  getInstruments: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: (handler: unknown) => handler,
  throwNotFound: (e: string, id: string) => {
    throw new Error(`${e} ${id} not found`);
  },
  throwFailedPrecondition: (m: string) => {
    throw new Error(m);
  },
  throwInvalidArgument: (m: string) => {
    throw new Error(m);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: {
    findById: mocks.findById,
    findByEmail: vi.fn(),
    findByUid: vi.fn(),
    update: mocks.update,
  },
  InstrumentsConfigRepository: { get: mocks.getInstruments },
}));

import { updateInstructor } from './update-instructor';

const run = updateInstructor as unknown as (d: unknown, c: unknown) => Promise<unknown>;

const existing = {
  id: 'teacher-1',
  name: 'Test Teacher',
  email: 'teacher@example.com',
  status: 'active',
  lessonRates: { piano: { '30-min-full': 4000 } }, // retired instrument
};

describe('updateInstructor lesson rates (#161)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(existing);
    mocks.getInstruments.mockResolvedValue({
      instruments: [{ key: 'violin', label: 'Violin' }],
    });
    mocks.update.mockImplementation(async (d) => ({ ...existing, ...d }));
  });

  it('accepts rates for offered instruments, keeping a retired one already there', async () => {
    await expect(
      run(
        {
          id: 'teacher-1',
          lessonRates: {
            piano: { '30-min-full': 4000 },
            violin: { '30-min-full': 4500 },
          },
        },
        {}
      )
    ).resolves.toBeDefined();
  });

  it('refuses rates for an instrument not offered', async () => {
    await expect(
      run({ id: 'teacher-1', lessonRates: { cello: { '30-min-full': 4500 } } }, {})
    ).rejects.toThrow('The studio does not offer Cello.');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
