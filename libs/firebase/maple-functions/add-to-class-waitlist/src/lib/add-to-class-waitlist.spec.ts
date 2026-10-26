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

  describe('waiting on one private hour', () => {
    const HOUR_A = new Date('2030-12-07T18:00:00Z');
    const HOUR_B = new Date('2030-12-07T19:00:00Z');
    const PAST_HOUR = new Date('2020-12-07T18:00:00Z');
    const privateHoursClass = {
      id: 'class-1',
      status: 'published',
      format: 'privateHours',
      durationMinutes: 60,
      sessions: [
        { dateTime: PAST_HOUR },
        { dateTime: HOUR_A },
        { dateTime: HOUR_B },
      ],
    };

    beforeEach(() => {
      mocks.waitlistAdd.mockResolvedValue({ created: true, entry: {} });
    });

    it('accepts an offered future hour and passes it on as a Date', async () => {
      mocks.classFindById.mockResolvedValue(privateHoursClass);

      const result = await mocks.capturedHandler!({
        classId: 'class-1',
        email: 'robin@example.com',
        slotStart: HOUR_A.toISOString(),
      });

      expect(result).toEqual({ added: true });
      const arg = mocks.waitlistAdd.mock.calls[0]?.[0] as { slotStart: unknown };
      expect(arg.slotStart).toBeInstanceOf(Date);
      expect(mocks.waitlistAdd).toHaveBeenCalledWith({
        classId: 'class-1',
        email: 'robin@example.com',
        slotStart: HOUR_A,
      });
    });

    it('rejects an hour the class does not offer', async () => {
      mocks.classFindById.mockResolvedValue(privateHoursClass);

      await expect(
        mocks.capturedHandler!({
          classId: 'class-1',
          email: 'robin@example.com',
          slotStart: '2030-12-07T18:30:00.000Z',
        })
      ).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(mocks.waitlistAdd).not.toHaveBeenCalled();
    });

    it('rejects an hour that has already started', async () => {
      mocks.classFindById.mockResolvedValue(privateHoursClass);

      await expect(
        mocks.capturedHandler!({
          classId: 'class-1',
          email: 'robin@example.com',
          slotStart: PAST_HOUR.toISOString(),
        })
      ).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(mocks.waitlistAdd).not.toHaveBeenCalled();
    });

    it('rejects a slotStart that is not a date', async () => {
      mocks.classFindById.mockResolvedValue(privateHoursClass);

      await expect(
        mocks.capturedHandler!({
          classId: 'class-1',
          email: 'robin@example.com',
          slotStart: 'not-a-date',
        })
      ).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(mocks.waitlistAdd).not.toHaveBeenCalled();
    });

    it('rejects an hour on a seat class', async () => {
      mocks.classFindById.mockResolvedValue({
        ...privateHoursClass,
        format: 'seats',
      });

      await expect(
        mocks.capturedHandler!({
          classId: 'class-1',
          email: 'robin@example.com',
          slotStart: HOUR_A.toISOString(),
        })
      ).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(mocks.waitlistAdd).not.toHaveBeenCalled();
    });

    it('adds an any-hour entry when no hour is given', async () => {
      mocks.classFindById.mockResolvedValue(privateHoursClass);

      await mocks.capturedHandler!({
        classId: 'class-1',
        email: 'robin@example.com',
      });

      const arg = mocks.waitlistAdd.mock.calls[0]?.[0] as { slotStart?: Date };
      expect(arg.slotStart).toBeUndefined();
    });
  });
});
