import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Instructor } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
    hasRole: mocks.hasRole,
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} ${id} not found`);
    },
    throwFailedPrecondition: (msg: string) => {
      throw new HttpsError('failed-precondition', msg);
    },
    throwInvalidArgument: (msg: string) => {
      throw new HttpsError('invalid-argument', msg);
    },
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError(
        'invalid-argument',
        `Validation failed: ${Object.keys(errs).join(',')}`
      );
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { findAll: mocks.findAll },
  InstrumentsConfigRepository: { get: vi.fn() },
}));

import { getInstructors } from './instructors';

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

    const result = (await getInstructors({}, { uid: 'admin-uid' })) as {
      instructors: Instructor[];
    };

    expect(mocks.hasRole).toHaveBeenCalledWith('admin-uid', 'admin');
    expect(result.instructors[0].isContractor).toBe(true);
    expect(result.instructors[0].readiness).toEqual(contractor.readiness);
  });

  it('strips readiness for a lesson teacher, keeping everything else', async () => {
    mocks.hasRole.mockResolvedValue(false);

    const result = (await getInstructors({}, { uid: 'teacher-uid' })) as {
      instructors: Instructor[];
    };

    expect(result.instructors[0]).not.toHaveProperty('readiness');
    expect(result.instructors[0]).not.toHaveProperty('isContractor');
    expect(result.instructors[0].name).toBe('Robin Ashfield');
  });

  it('passes the status filter through', async () => {
    mocks.hasRole.mockResolvedValue(true);

    await getInstructors({ status: 'active' }, { uid: 'admin-uid' });

    expect(mocks.findAll).toHaveBeenCalledWith({ status: 'active' });
  });
});
