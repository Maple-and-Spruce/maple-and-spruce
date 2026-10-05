import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  handler: null as null | ((d: unknown) => Promise<unknown>),
  create: vi.fn(),
  getInstruments: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    requiringRole: () => endpoint,
    validating: () => endpoint,
    ensuringUnique: () => endpoint,
    handle: (h: (d: unknown) => Promise<unknown>) => {
      mocks.handler = h;
      return 'mock';
    },
  };
  return {
    Functions: { endpoint },
    Role: { Admin: 'admin' },
    throwInvalidArgument: (m: string) => {
      throw new Error(m);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { create: mocks.create, findByEmail: vi.fn() },
  InstrumentsConfigRepository: { get: mocks.getInstruments },
}));

import './create-instructor';

describe('createInstructor lesson rates (#161)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInstruments.mockResolvedValue({
      instruments: [{ key: 'violin', label: 'Violin' }],
    });
    mocks.create.mockImplementation(async (d) => ({ id: 'teacher-1', ...d }));
  });

  it('creates an instructor with rates for offered instruments', async () => {
    await expect(
      mocks.handler!({ name: 'Test', lessonRates: { violin: { '30-min-full': 4500 } } })
    ).resolves.toMatchObject({ instructor: { id: 'teacher-1' } });
  });

  it('needs no lookup when there are no rates', async () => {
    await mocks.handler!({ name: 'Test' });
    expect(mocks.getInstruments).not.toHaveBeenCalled();
  });

  it('refuses rates for an instrument not offered', async () => {
    await expect(
      mocks.handler!({ name: 'Test', lessonRates: { harp: { '30-min-full': 4500 } } })
    ).rejects.toThrow('The studio does not offer Harp.');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
