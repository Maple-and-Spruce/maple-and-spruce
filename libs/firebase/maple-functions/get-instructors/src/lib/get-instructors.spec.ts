import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Instructor } from '@maple/ts/domain';

type Handler = (data: unknown, context: { uid?: string }) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  handler: null as Handler | null,
  findAll: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  hasRole: mocks.hasRole,
  createRoleFunction: vi.fn((h: Handler) => {
    mocks.handler = h;
    return 'mock-fn';
  }),
}));

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { findAll: mocks.findAll },
}));

import './get-instructors';

const contractor: Instructor = {
  id: 'instructor-1',
  name: 'Robin Ashfield',
  email: 'robin@example.com',
  status: 'active',
  payRate: 7500,
  payRateType: 'flat',
  isContractor: true,
  readiness: { backgroundCheck: { clearedOn: '2026-09-10' } },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('getInstructors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockResolvedValue([contractor]);
  });

  it('gives an admin the contractor readiness record', async () => {
    mocks.hasRole.mockResolvedValue(true);

    const result = (await mocks.handler!({}, { uid: 'admin-uid' })) as {
      instructors: Instructor[];
    };

    expect(mocks.hasRole).toHaveBeenCalledWith('admin-uid', 'admin');
    expect(result.instructors[0].isContractor).toBe(true);
    expect(result.instructors[0].readiness).toEqual(contractor.readiness);
  });

  it('strips readiness for a lesson teacher, keeping everything else', async () => {
    mocks.hasRole.mockResolvedValue(false);

    const result = (await mocks.handler!({}, { uid: 'teacher-uid' })) as {
      instructors: Instructor[];
    };

    expect(result.instructors[0]).not.toHaveProperty('readiness');
    expect(result.instructors[0]).not.toHaveProperty('isContractor');
    expect(result.instructors[0].name).toBe('Robin Ashfield');
  });

  it('passes the status filter through', async () => {
    mocks.hasRole.mockResolvedValue(true);

    await mocks.handler!({ status: 'active' }, { uid: 'admin-uid' });

    expect(mocks.findAll).toHaveBeenCalledWith({ status: 'active' });
  });
});
