import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  getInstruments: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  hasRole: vi.fn(),
  throwNotFound: (e: string, id: string) => {
    throw new Error(`${e} ${id} not found`);
  },
  throwFailedPrecondition: (m: string) => {
    throw new Error(m);
  },
  throwInvalidArgument: (m: string) => {
    throw new Error(m);
  },
  throwValidationError: (errs: Record<string, string[]>) => {
    throw Object.assign(
      new Error(`Validation failed: ${Object.keys(errs).join(',')}`),
      { code: 'invalid-argument' }
    );
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

import { updateInstructor } from './instructors';

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

describe('updateInstructor contractor readiness', () => {
  const plain = { id: 'teacher-1', name: 'Test Teacher', status: 'active' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(plain);
    mocks.update.mockImplementation(async (d) => ({ ...plain, ...d }));
  });

  it('records the contractor flag and readiness items', async () => {
    const readiness = {
      contractorAgreement: { signedOn: '2026-09-01' },
      backgroundCheck: { clearedOn: '2026-09-10' },
      paymentSetup: { completedOn: '2026-09-12', method: 'w9-on-file' },
    };

    await run({ id: 'teacher-1', isContractor: true, readiness }, {});

    expect(mocks.update).toHaveBeenCalledWith({
      id: 'teacher-1',
      isContractor: true,
      readiness,
    });
  });

  it('rejects an invalid date as invalid-argument, before writing', async () => {
    await expect(
      run(
        {
          id: 'teacher-1',
          readiness: { backgroundCheck: { clearedOn: '09/10/2026' } },
        },
        {}
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a payment setup with no method', async () => {
    await expect(
      run(
        { id: 'teacher-1', readiness: { paymentSetup: { completedOn: '2026-09-12' } } },
        {}
      )
    ).rejects.toThrow(/paymentSetupMethod/);
  });
});
