import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  getInstruments: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  assertCanManageStudent: vi.fn(),
  throwNotFound: (e: string, id: string) => {
    throw new Error(`${e} ${id} not found`);
  },
  throwInvalidArgument: (m: string) => {
    throw new Error(m);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findById: mocks.findById, update: mocks.update },
  InstrumentsConfigRepository: { get: mocks.getInstruments },
}));

import { updateStudent } from './students';

const run = updateStudent as unknown as (
  d: unknown,
  c: unknown,
) => Promise<unknown>;

const existing = {
  id: 'stu-1',
  name: 'Test Student',
  instrument: 'piano', // retired: no longer offered
  isAdultStudent: true,
  primaryTeacherId: 'teacher-1',
  isHopeScholarship: false,
  primaryContactName: 'Test Student',
  primaryContactEmail: 'test@example.com',
  status: 'active',
};

describe('updateStudent instruments (#161)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(existing);
    mocks.getInstruments.mockResolvedValue({
      instruments: [{ key: 'violin', label: 'Violin' }],
    });
    mocks.update.mockImplementation(async (d) => ({ ...existing, ...d }));
  });

  it('lets a student on a retired instrument keep it while other fields change', async () => {
    await expect(
      run({ id: 'stu-1', name: 'Test Student Renamed' }, {}),
    ).resolves.toBeDefined();
    await expect(
      run({ id: 'stu-1', instrument: 'piano' }, {}),
    ).resolves.toBeDefined();
    expect(mocks.getInstruments).not.toHaveBeenCalled();
  });

  it('allows moving to an offered instrument', async () => {
    await expect(
      run({ id: 'stu-1', instrument: 'violin' }, {}),
    ).resolves.toBeDefined();
  });

  it('refuses moving to one not offered', async () => {
    await expect(run({ id: 'stu-1', instrument: 'cello' }, {})).rejects.toThrow(
      'Cello is not an instrument the studio offers.',
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
