import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findByEmail: vi.fn(),
  getInstruments: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  hasRole: vi.fn(),
  throwInvalidArgument: (m: string) => {
    throw new Error(m);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { create: mocks.create, findByEmail: mocks.findByEmail },
  InstrumentsConfigRepository: { get: mocks.getInstruments },
}));

import { createInstructor, createInstructorEmailUniqueness } from './instructors';

const handler = createInstructor as (d: unknown) => Promise<unknown>;
const uniqueEmail = createInstructorEmailUniqueness as unknown as {
  when: (d: { email?: string }) => boolean;
  exists: (email: unknown) => Promise<boolean>;
};

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
      handler({ name: 'Test', lessonRates: { violin: { '30-min-full': 4500 } } })
    ).resolves.toMatchObject({ instructor: { id: 'teacher-1' } });
  });

  it('needs no lookup when there are no rates', async () => {
    await handler({ name: 'Test' });
    expect(mocks.getInstruments).not.toHaveBeenCalled();
  });

  it('refuses rates for an instrument not offered', async () => {
    await expect(
      handler({ name: 'Test', lessonRates: { harp: { '30-min-full': 4500 } } })
    ).rejects.toThrow('The studio does not offer Harp.');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('createInstructor email uniqueness', () => {
  it('checks a given email', () => {
    expect(uniqueEmail.when({ email: 'teacher@example.com' })).toBe(true);
  });

  it('skips the check when there is no email, so many can be added without one', () => {
    expect(uniqueEmail.when({})).toBe(false);
    expect(uniqueEmail.when({ email: '' })).toBe(false);
  });

  it('reports an email already in use', async () => {
    mocks.findByEmail.mockResolvedValueOnce({ id: 'other' });
    await expect(uniqueEmail.exists('teacher@example.com')).resolves.toBe(true);
    mocks.findByEmail.mockResolvedValueOnce(undefined);
    await expect(uniqueEmail.exists('new@example.com')).resolves.toBe(false);
  });
});
