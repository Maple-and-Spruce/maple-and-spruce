import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  classFindAll: vi.fn(),
  instructorFindById: vi.fn(),
  categoryFindById: vi.fn(),
  countByClassId: vi.fn(),
  capturedHandler: null as
    | ((data: unknown) => Promise<unknown>)
    | null,
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findById: mocks.classFindById,
    findAll: mocks.classFindAll,
  },
  InstructorRepository: { findById: mocks.instructorFindById },
  ClassCategoryRepository: { findById: mocks.categoryFindById },
  RegistrationRepository: { countByClassId: mocks.countByClassId },
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    Functions: {
      endpoint: {
        withOptions: vi.fn().mockReturnThis(),
        handle: vi.fn(
          (handler: (data: unknown) => Promise<unknown>) => {
            mocks.capturedHandler = handler;
            return 'mock-function';
          }
        ),
      },
    },
    throwInvalidArgument: (msg: string) => {
      throw new HttpsError('invalid-argument', msg);
    },
    throwNotFound: (resource: string, id: string) => {
      throw new HttpsError('not-found', `${resource} not found: ${id}`);
    },
  };
});

import './get-related-public-classes';

interface FakeClass {
  id: string;
  name: string;
  description: string;
  sessions: { dateTime: Date }[];
  durationMinutes: number;
  capacity: number;
  priceCents: number;
  status: string;
  skillLevel: string;
  categoryId?: string;
  instructorId?: string;
}

function fakeClass(overrides: Partial<FakeClass> = {}): FakeClass {
  return {
    id: 'class-x',
    name: 'A class',
    description: 'desc',
    sessions: [{ dateTime: new Date('2030-06-01T14:00:00Z') }],
    durationMinutes: 120,
    capacity: 8,
    priceCents: 4500,
    status: 'published',
    skillLevel: 'beginner',
    categoryId: 'cat-1',
    ...overrides,
  };
}

describe('getRelatedPublicClasses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.instructorFindById.mockResolvedValue(undefined);
    mocks.categoryFindById.mockResolvedValue(undefined);
    mocks.countByClassId.mockResolvedValue(0);
  });

  it('rejects missing classId', async () => {
    await expect(mocks.capturedHandler!({})).rejects.toThrow(
      /Class ID is required/
    );
  });

  it('rejects when source class not found', async () => {
    mocks.classFindById.mockResolvedValue(undefined);
    await expect(
      mocks.capturedHandler!({ classId: 'missing' })
    ).rejects.toThrow(/Class not found/);
  });

  it('returns empty list when source has no category', async () => {
    mocks.classFindById.mockResolvedValue(
      fakeClass({ id: 'src', categoryId: undefined })
    );

    const result = (await mocks.capturedHandler!({ classId: 'src' })) as {
      classes: unknown[];
    };

    expect(result.classes).toEqual([]);
    expect(mocks.classFindAll).not.toHaveBeenCalled();
  });

  it('excludes the source class and unavailable siblings, sorted earliest-first', async () => {
    mocks.classFindById.mockResolvedValue(
      fakeClass({ id: 'src', categoryId: 'cat-1' })
    );
    const later = fakeClass({
      id: 'later',
      name: 'Later sibling',
      sessions: [{ dateTime: new Date('2030-08-01T14:00:00Z') }],
    });
    const earlier = fakeClass({
      id: 'earlier',
      name: 'Earlier sibling',
      sessions: [{ dateTime: new Date('2030-07-01T14:00:00Z') }],
    });
    const full = fakeClass({
      id: 'full',
      name: 'Full sibling',
      sessions: [{ dateTime: new Date('2030-07-15T14:00:00Z') }],
    });
    mocks.classFindAll.mockResolvedValue([later, earlier, full, fakeClass({ id: 'src' })]);
    mocks.countByClassId.mockImplementation(async (id: string) =>
      id === 'full' ? 8 : 0
    );

    const result = (await mocks.capturedHandler!({ classId: 'src' })) as {
      classes: { id: string }[];
    };

    expect(result.classes.map((c) => c.id)).toEqual(['earlier', 'later']);
    expect(mocks.classFindAll).toHaveBeenCalledWith({
      status: 'published',
      categoryId: 'cat-1',
      upcoming: true,
    });
  });

  it('clamps the limit between 1 and the max', async () => {
    mocks.classFindById.mockResolvedValue(
      fakeClass({ id: 'src', categoryId: 'cat-1' })
    );
    const siblings = Array.from({ length: 10 }, (_, i) =>
      fakeClass({
        id: `sibling-${i}`,
        sessions: [
          { dateTime: new Date(2030, 0, i + 1, 12, 0, 0) },
        ],
      })
    );
    mocks.classFindAll.mockResolvedValue(siblings);
    mocks.countByClassId.mockResolvedValue(0);

    const result = (await mocks.capturedHandler!({
      classId: 'src',
      limit: 100,
    })) as { classes: unknown[] };

    // MAX_LIMIT = 6 in the implementation
    expect(result.classes.length).toBeLessThanOrEqual(6);
  });
});
