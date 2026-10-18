import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getInstruments: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  assertCanManageStudent: vi.fn(),
  throwInvalidArgument: (m: string) => {
    throw new Error(m);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { create: mocks.create },
  InstrumentsConfigRepository: { get: mocks.getInstruments },
}));

import { createStudent } from './students';

const run = createStudent as unknown as (
  d: unknown,
  c: unknown,
) => Promise<unknown>;

const valid = {
  name: 'Test Student',
  instrument: 'violin',
  isAdultStudent: true,
  primaryTeacherId: 'teacher-1',
  isHopeScholarship: false,
  primaryContactName: 'Test Student',
  primaryContactEmail: 'test@example.com',
  status: 'active',
};

describe('createStudent instruments (#161)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInstruments.mockResolvedValue({
      instruments: [{ key: 'violin', label: 'Violin' }],
    });
    mocks.create.mockImplementation(async (d) => ({ id: 'stu-1', ...d }));
  });

  it('creates a student on an instrument the studio offers', async () => {
    await expect(run(valid, { uid: 'u' })).resolves.toMatchObject({
      student: { id: 'stu-1', instrument: 'violin' },
    });
  });

  it('refuses one the studio does not offer, by name', async () => {
    await expect(
      run({ ...valid, instrument: 'piano' }, { uid: 'u' }),
    ).rejects.toThrow('Piano is not an instrument the studio offers.');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
