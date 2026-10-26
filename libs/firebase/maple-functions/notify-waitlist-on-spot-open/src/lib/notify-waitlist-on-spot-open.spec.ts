import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  waitlistFind: vi.fn(),
  waitlistClear: vi.fn(),
  waitlistDeleteEntries: vi.fn(),
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
      deleteEntries: mocks.waitlistDeleteEntries,
    },
  };
});

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
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
    // No webflowSlug on this fixture → falls back to the name-derived slug.
    expect(firstCall.template.data.classUrl).toBe(
      'https://mapleandsprucefolkarts.com/classes/try-it-stained-glass'
    );
    expect(mocks.batchCommit).toHaveBeenCalledOnce();
    expect(mocks.waitlistClear).toHaveBeenCalledWith('class-1');
  });

  it('links to the real Webflow slug when the class has one', async () => {
    // Webflow auto-suffixes slug collisions; the stored slug does not match
    // the name-derived one, so the email must use the stored value verbatim.
    mocks.classFindById.mockResolvedValue({
      ...publishedClass,
      webflowSlug: 'stained-glass-tryit-class-b192d',
    });
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

    const firstCall = mocks.batchSet.mock.calls[0]?.[1] as {
      template: { data: { classUrl: string } };
    };
    expect(firstCall.template.data.classUrl).toBe(
      'https://mapleandsprucefolkarts.com/classes/stained-glass-tryit-class-b192d'
    );
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

describe('notifyWaitlistOnSpotOpen for a private-hours class', () => {
  // Sat, Dec 7 2030, 1–2 PM and 2–3 PM in New York.
  const HOUR_A = new Date('2030-12-07T18:00:00Z');
  const HOUR_B = new Date('2030-12-07T19:00:00Z');
  const PAST_HOUR = new Date('2020-12-05T18:00:00Z');

  const privateHoursClass = {
    id: 'class-1',
    name: 'Private Pottery Hour',
    status: 'published',
    format: 'privateHours',
    durationMinutes: 60,
    sessions: [
      { dateTime: PAST_HOUR },
      { dateTime: HOUR_A },
      { dateTime: HOUR_B },
    ],
  };

  const entry = (id: string, email: string, slotStart?: Date) => ({
    id,
    classId: 'class-1',
    email,
    slotStart,
    createdAt: new Date('2030-11-01T00:00:00Z'),
  });

  const robinForA = entry(
    `robin@example.com__${HOUR_A.getTime()}`,
    'robin@example.com',
    HOUR_A
  );
  const samForB = entry(
    `sam@example.com__${HOUR_B.getTime()}`,
    'sam@example.com',
    HOUR_B
  );
  const averyAny = entry('avery@example.com', 'avery@example.com');

  /** A Firestore Timestamp, as the before snapshot carries it. */
  const timestamp = (d: Date) => ({ toDate: () => d });

  const cancelHour = (slotStart: unknown) =>
    handler(
      event(
        snap({ status: 'confirmed', classId: 'class-1', slotStart }),
        snap({ status: 'cancelled', classId: 'class-1', slotStart })
      )
    );

  type MailDoc = {
    to: string;
    template: { name: string; data: { className: string; classDate: string; classUrl: string } };
  };
  const mails = () =>
    mocks.batchSet.mock.calls.map((c) => c[1] as MailDoc);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchCommit.mockResolvedValue(undefined);
    mocks.waitlistDeleteEntries.mockResolvedValue(undefined);
    mocks.classFindById.mockResolvedValue(privateHoursClass);
  });

  it('emails the hour and any-hour lists, naming the hour, and deletes only them', async () => {
    mocks.waitlistFind.mockResolvedValue([robinForA, samForB, averyAny]);

    await cancelHour(timestamp(HOUR_A));

    expect(mails().map((m) => m.to)).toEqual([
      'robin@example.com',
      'avery@example.com',
    ]);
    for (const m of mails()) {
      expect(m.template.name).toBe('class-spot-available');
      expect(m.template.data.className).toBe('Private Pottery Hour');
      expect(m.template.data.classDate).toBe('Sat, Dec 7, 1:00–2:00 PM');
      expect(m.template.data.classUrl).toBe(
        'https://mapleandsprucefolkarts.com/classes/private-pottery-hour'
      );
    }
    expect(mocks.batchCommit).toHaveBeenCalledOnce();
    expect(mocks.waitlistDeleteEntries).toHaveBeenCalledWith('class-1', [
      robinForA.id,
      averyAny.id,
    ]);
    expect(mocks.waitlistClear).not.toHaveBeenCalled();
  });

  it('reads a slotStart held as a plain Date', async () => {
    mocks.waitlistFind.mockResolvedValue([robinForA]);

    await cancelHour(HOUR_A);

    expect(mails().map((m) => m.to)).toEqual(['robin@example.com']);
    expect(mocks.waitlistDeleteEntries).toHaveBeenCalledWith('class-1', [
      robinForA.id,
    ]);
  });

  it('emails an address on both the hour and any-hour list once, and deletes both entries', async () => {
    const robinAny = entry('robin@example.com', 'Robin@Example.com');
    mocks.waitlistFind.mockResolvedValue([robinForA, robinAny]);

    await cancelHour(timestamp(HOUR_A));

    expect(mails()).toHaveLength(1);
    expect(mails()[0]?.to).toBe('robin@example.com');
    expect(mocks.waitlistDeleteEntries).toHaveBeenCalledWith('class-1', [
      robinForA.id,
      robinAny.id,
    ]);
  });

  it('neither emails nor deletes an entry for a different hour', async () => {
    mocks.waitlistFind.mockResolvedValue([samForB]);

    await cancelHour(timestamp(HOUR_A));

    expect(mocks.batchSet).not.toHaveBeenCalled();
    expect(mocks.waitlistDeleteEntries).not.toHaveBeenCalled();
    expect(mocks.waitlistClear).not.toHaveBeenCalled();
  });

  it('emails nobody and deletes nothing when the hour has passed', async () => {
    const robinForPast = entry('robin-past', 'robin@example.com', PAST_HOUR);
    mocks.waitlistFind.mockResolvedValue([robinForPast, averyAny]);

    await cancelHour(timestamp(PAST_HOUR));

    expect(mocks.batchSet).not.toHaveBeenCalled();
    expect(mocks.batchCommit).not.toHaveBeenCalled();
    expect(mocks.waitlistDeleteEntries).not.toHaveBeenCalled();
    expect(mocks.waitlistClear).not.toHaveBeenCalled();
  });

  it('emails nobody and deletes nothing when the registration held no hour', async () => {
    mocks.waitlistFind.mockResolvedValue([robinForA, averyAny]);

    await cancelHour(undefined);

    expect(mocks.batchSet).not.toHaveBeenCalled();
    expect(mocks.waitlistDeleteEntries).not.toHaveBeenCalled();
    expect(mocks.waitlistClear).not.toHaveBeenCalled();
  });

  it('leaves a seat class on the email-everyone, clear-all path', async () => {
    mocks.classFindById.mockResolvedValue({
      ...privateHoursClass,
      format: 'seats',
    });
    mocks.waitlistFind.mockResolvedValue([robinForA, samForB, averyAny]);
    mocks.waitlistClear.mockResolvedValue(undefined);

    await cancelHour(timestamp(HOUR_A));

    expect(mails()).toHaveLength(3);
    expect(mocks.waitlistClear).toHaveBeenCalledWith('class-1');
    expect(mocks.waitlistDeleteEntries).not.toHaveBeenCalled();
  });
});
