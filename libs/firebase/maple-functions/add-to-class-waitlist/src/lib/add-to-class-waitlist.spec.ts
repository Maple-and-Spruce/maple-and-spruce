import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  waitlistAdd: vi.fn(),
  capturedHandler: null as
    | ((data: unknown) => Promise<unknown>)
    | null,
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: { findById: mocks.classFindById },
  ClassWaitlistRepository: { add: mocks.waitlistAdd },
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
    throwValidationError: (errors: Record<string, string[]>) => {
      throw new HttpsError(
        'invalid-argument',
        `Validation failed: ${JSON.stringify(errors)}`
      );
    },
  };
});

import './add-to-class-waitlist';

const publishedClass = { id: 'class-1', status: 'published' };

describe('addToClassWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid input', async () => {
    await expect(
      mocks.capturedHandler!({ classId: '', email: 'not-an-email' })
    ).rejects.toThrow(/Validation failed/);
    expect(mocks.classFindById).not.toHaveBeenCalled();
  });

  it('rejects when class is not found', async () => {
    mocks.classFindById.mockResolvedValue(undefined);

    await expect(
      mocks.capturedHandler!({
        classId: 'missing',
        email: 'alice@example.com',
      })
    ).rejects.toThrow(/Class not found/);
    expect(mocks.waitlistAdd).not.toHaveBeenCalled();
  });

  it('rejects when class is not published', async () => {
    mocks.classFindById.mockResolvedValue({
      id: 'class-1',
      status: 'draft',
    });

    await expect(
      mocks.capturedHandler!({
        classId: 'class-1',
        email: 'alice@example.com',
      })
    ).rejects.toThrow(/not available/);
    expect(mocks.waitlistAdd).not.toHaveBeenCalled();
  });

  it('returns added=true on a new signup', async () => {
    mocks.classFindById.mockResolvedValue(publishedClass);
    mocks.waitlistAdd.mockResolvedValue({
      created: true,
      entry: {
        id: 'alice@example.com',
        classId: 'class-1',
        email: 'alice@example.com',
        createdAt: new Date(),
      },
    });

    const result = await mocks.capturedHandler!({
      classId: 'class-1',
      email: 'alice@example.com',
    });

    expect(result).toEqual({ added: true });
    expect(mocks.waitlistAdd).toHaveBeenCalledWith({
      classId: 'class-1',
      email: 'alice@example.com',
    });
  });

  it('returns added=false on a duplicate signup', async () => {
    mocks.classFindById.mockResolvedValue(publishedClass);
    mocks.waitlistAdd.mockResolvedValue({
      created: false,
      entry: {
        id: 'alice@example.com',
        classId: 'class-1',
        email: 'alice@example.com',
        createdAt: new Date(),
      },
    });

    const result = await mocks.capturedHandler!({
      classId: 'class-1',
      email: 'alice@example.com',
    });

    expect(result).toEqual({ added: false });
  });
});
