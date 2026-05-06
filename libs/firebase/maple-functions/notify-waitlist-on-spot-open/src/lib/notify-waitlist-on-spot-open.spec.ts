import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  waitlistFind: vi.fn(),
  waitlistClear: vi.fn(),
  mailDoc: vi.fn(),
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => {
  const mailRefStub = { id: 'auto-id' };
  const mailCollection = {
    doc: () => {
      mocks.mailDoc();
      return mailRefStub;
    },
  };
  const db = {
    collection: () => mailCollection,
    batch: () => ({
      set: mocks.batchSet,
      commit: mocks.batchCommit,
    }),
  };
  return {
    getDb: () => db,
    ClassRepository: { findById: mocks.classFindById },
    ClassWaitlistRepository: {
      findByClassId: mocks.waitlistFind,
      clearByClassId: mocks.waitlistClear,
    },
  };
});

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));

vi.mock('firebase-functions/params', () => ({
  defineString: vi.fn((name: string) => ({
    name,
    value: () =>
      name === 'ALLOWED_ORIGINS'
        ? 'http://localhost:3000,https://mapleandsprucefolkarts.com'
        : `mock-${name}`,
  })),
}));

import {
  isSpotOpeningChange,
  notifyWaitlistOnSpotOpen,
} from './notify-waitlist-on-spot-open';

const handler = notifyWaitlistOnSpotOpen as unknown as (
  event: unknown
) => Promise<void>;

interface FakeSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

function snap(data: Record<string, unknown> | null): FakeSnapshot {
  return {
    exists: data !== null,
    data: () => (data === null ? undefined : data),
  };
}

function event(
  before: FakeSnapshot | undefined,
  after: FakeSnapshot | undefined
): unknown {
  return {
    data: { before, after },
    params: { registrationId: 'reg-1' },
  };
}

const publishedClass = {
  id: 'class-1',
  name: 'Try-It Stained Glass',
  status: 'published',
  sessions: [{ dateTime: new Date('2030-06-15T17:00:00Z') }],
};

describe('isSpotOpeningChange', () => {
  it('detects active → inactive status update', () => {
    expect(
      isSpotOpeningChange(
        snap({ status: 'confirmed' }) as never,
        snap({ status: 'cancelled' }) as never
      )
    ).toBe(true);
  });

  it('detects active → refunded', () => {
    expect(
      isSpotOpeningChange(
        snap({ status: 'pending' }) as never,
        snap({ status: 'refunded' }) as never
      )
    ).toBe(true);
  });

  it('detects deletion of an active registration', () => {
    expect(
      isSpotOpeningChange(
        snap({ status: 'confirmed' }) as never,
        snap(null) as never
      )
    ).toBe(true);
  });

  it('does not fire on initial creation', () => {
    expect(
      isSpotOpeningChange(
        snap(null) as never,
        snap({ status: 'pending' }) as never
      )
    ).toBe(false);
  });

  it('does not fire on pending → confirmed (still active)', () => {
    expect(
      isSpotOpeningChange(
        snap({ status: 'pending' }) as never,
        snap({ status: 'confirmed' }) as never
      )
    ).toBe(false);
  });

  it('does not fire when both sides are inactive', () => {
    expect(
      isSpotOpeningChange(
        snap({ status: 'cancelled' }) as never,
        snap({ status: 'refunded' }) as never
      )
    ).toBe(false);
  });

  it('does not fire when deleting an already-inactive registration', () => {
    expect(
      isSpotOpeningChange(
        snap({ status: 'cancelled' }) as never,
        snap(null) as never
      )
    ).toBe(false);
  });
});

describe('notifyWaitlistOnSpotOpen handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchCommit.mockResolvedValue(undefined);
    mocks.waitlistClear.mockResolvedValue(undefined);
  });

  it('does nothing when the change is not a spot opening', async () => {
    await handler(
      event(
        snap(null),
        snap({ status: 'pending', classId: 'class-1' })
      )
    );
    expect(mocks.classFindById).not.toHaveBeenCalled();
    expect(mocks.waitlistFind).not.toHaveBeenCalled();
  });

  it('skips notify when waitlist is empty', async () => {
    mocks.classFindById.mockResolvedValue(publishedClass);
    mocks.waitlistFind.mockResolvedValue([]);

    await handler(
      event(
        snap({ status: 'confirmed', classId: 'class-1' }),
        snap({ status: 'cancelled', classId: 'class-1' })
      )
    );

    expect(mocks.batchCommit).not.toHaveBeenCalled();
    expect(mocks.waitlistClear).not.toHaveBeenCalled();
  });

  it('queues mail for each entry and clears the waitlist', async () => {
    mocks.classFindById.mockResolvedValue(publishedClass);
    mocks.waitlistFind.mockResolvedValue([
      {
        id: 'alice@example.com',
        classId: 'class-1',
        email: 'alice@example.com',
        createdAt: new Date(),
      },
      {
        id: 'bob@example.com',
        classId: 'class-1',
        email: 'bob@example.com',
        createdAt: new Date(),
      },
    ]);

    await handler(
      event(
        snap({ status: 'confirmed', classId: 'class-1' }),
        snap({ status: 'cancelled', classId: 'class-1' })
      )
    );

    expect(mocks.batchSet).toHaveBeenCalledTimes(2);
    const firstCall = mocks.batchSet.mock.calls[0]?.[1] as {
      to: string;
      template: { name: string; data: { classUrl: string; className: string } };
    };
    expect(firstCall.to).toBe('alice@example.com');
    expect(firstCall.template.name).toBe('class-spot-available');
    expect(firstCall.template.data.className).toBe('Try-It Stained Glass');
    expect(firstCall.template.data.classUrl).toBe(
      'https://mapleandsprucefolkarts.com/classes/try-it-stained-glass'
    );
    expect(mocks.batchCommit).toHaveBeenCalledOnce();
    expect(mocks.waitlistClear).toHaveBeenCalledWith('class-1');
  });

  it('clears waitlist without emailing when class is unpublished or gone', async () => {
    mocks.classFindById.mockResolvedValue(undefined);
    mocks.waitlistFind.mockResolvedValue([
      {
        id: 'alice@example.com',
        classId: 'class-1',
        email: 'alice@example.com',
        createdAt: new Date(),
      },
    ]);

    await handler(
      event(
        snap({ status: 'confirmed', classId: 'class-1' }),
        snap({ status: 'cancelled', classId: 'class-1' })
      )
    );

    expect(mocks.batchSet).not.toHaveBeenCalled();
    expect(mocks.waitlistClear).toHaveBeenCalledWith('class-1');
  });
});
