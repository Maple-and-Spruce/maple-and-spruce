import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Instructor } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
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
  InstructorRepository: { findById: mocks.findById },
  InstrumentsConfigRepository: { get: vi.fn() },
}));

import { getInstructor } from './instructors';

const contractor: Instructor = {
  id: 'instructor-1',
  name: 'Robin Ashfield',
  email: 'robin@example.com',
  status: 'active',
  isContractor: true,
  readiness: { backgroundCheck: { clearedOn: '2026-09-10' } },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('getInstructor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(contractor);
  });

  it('gives an admin the readiness record', async () => {
    mocks.hasRole.mockResolvedValue(true);

    const result = (await getInstructor({ id: 'instructor-1' }, { uid: 'a' })) as {
      instructor: Instructor;
    };

    expect(result.instructor.readiness).toEqual(contractor.readiness);
  });

  it('strips readiness for a non-admin', async () => {
    mocks.hasRole.mockResolvedValue(false);

    const result = (await getInstructor({ id: 'instructor-1' }, { uid: 't' })) as {
      instructor: Instructor;
    };

    expect(result.instructor).not.toHaveProperty('readiness');
    expect(result.instructor).not.toHaveProperty('isContractor');
  });

  it('throws not-found for an unknown id', async () => {
    mocks.hasRole.mockResolvedValue(true);
    mocks.findById.mockResolvedValue(undefined);

    await expect(getInstructor({ id: 'nope' }, { uid: 'a' })).rejects.toThrow(
      'Instructor nope not found'
    );
  });
});
