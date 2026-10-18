import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Instructor } from '@maple/ts/domain';

type Handler = (data: unknown, context: { uid?: string }) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  handler: null as Handler | null,
  findById: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  hasRole: mocks.hasRole,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  },
  createRoleFunction: vi.fn((h: Handler) => {
    mocks.handler = h;
    return 'mock-fn';
  }),
}));

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { findById: mocks.findById },
}));

import './get-instructor';

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

    const result = (await mocks.handler!({ id: 'instructor-1' }, { uid: 'a' })) as {
      instructor: Instructor;
    };

    expect(result.instructor.readiness).toEqual(contractor.readiness);
  });

  it('strips readiness for a non-admin', async () => {
    mocks.hasRole.mockResolvedValue(false);

    const result = (await mocks.handler!({ id: 'instructor-1' }, { uid: 't' })) as {
      instructor: Instructor;
    };

    expect(result.instructor).not.toHaveProperty('readiness');
    expect(result.instructor).not.toHaveProperty('isContractor');
  });

  it('throws not-found for an unknown id', async () => {
    mocks.hasRole.mockResolvedValue(true);
    mocks.findById.mockResolvedValue(undefined);

    await expect(mocks.handler!({ id: 'nope' }, { uid: 'a' })).rejects.toThrow(
      'Instructor nope not found'
    );
  });
});
