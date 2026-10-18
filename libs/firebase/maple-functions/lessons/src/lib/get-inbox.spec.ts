import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * getInbox reads, hands everything to the domain builder and drops dismissed
 * keys. The freshness rules are pinned in `inbox.spec.ts`; this pins what is
 * read, that it is the whole studio, and that dismissals are honoured.
 * All people are invented.
 */
const mocks = vi.hoisted(() => ({
  collectNeedsAttention: vi.fn(),
  findInquiries: vi.fn(),
  findMembers: vi.fn(),
  findAgreements: vi.fn(),
  findPendingConflicts: vi.fn(),
  findClass: vi.fn(),
  findDismissals: vi.fn(),
  findWithRefunds: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  LessonInquiryRepository: { findAll: mocks.findInquiries },
  CraftClubMemberRepository: { findAll: mocks.findMembers },
  AgreementRequestRepository: { findAll: mocks.findAgreements },
  SyncConflictRepository: { findPending: mocks.findPendingConflicts },
  ClassRepository: { findById: mocks.findClass },
  InboxDismissalRepository: { findByKeys: mocks.findDismissals },
  RegistrationRepository: { findWithRefunds: mocks.findWithRefunds },
}));

vi.mock('@maple/firebase/maple-functions/get-needs-attention', () => ({
  collectNeedsAttention: mocks.collectNeedsAttention,
}));

import { getInbox } from './get-inbox';

const NOW = new Date('2026-10-14T19:10:00Z');
const HOUR = 3_600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  mocks.collectNeedsAttention.mockResolvedValue({
    groups: [
      {
        kind: 'lesson-unbilled',
        title: '',
        because: '',
        rows: [
          {
            kind: 'lesson-unbilled',
            id: 'les-9',
            label: 'Robin Ashfield',
            detail: 'Taught Oct 12, 2026, never invoiced',
            href: '/students/stu-1?chargeLesson=les-9',
            resolution: 'navigate',
            occurredAt: new Date(NOW.getTime() - 48 * HOUR).toISOString(),
          },
        ],
      },
    ],
    students: [{ id: 'stu-1', name: 'Robin Ashfield' }],
    lessons: [
      // Past and cancelled lessons are not "next".
      { studentId: 'stu-1', scheduledAt: new Date(NOW.getTime() - HOUR), status: 'scheduled' },
      { studentId: 'stu-1', scheduledAt: new Date(NOW.getTime() + HOUR), status: 'cancelled' },
      { studentId: 'stu-1', scheduledAt: new Date('2026-10-21T19:30:00Z'), status: 'scheduled' },
      { studentId: 'stu-1', scheduledAt: new Date('2026-10-28T19:30:00Z'), status: 'scheduled' },
    ],
    charges: [
      {
        id: 'chg-1',
        studentId: 'stu-1',
        status: 'failed',
        amountCents: 3500,
        lastError: 'Card declined',
        resolvedAt: new Date(NOW.getTime() - 5 * HOUR),
        updatedAt: new Date(NOW.getTime() - 5 * HOUR),
      },
    ],
  });
  mocks.findInquiries.mockResolvedValue([
    {
      id: 'inq-1',
      status: 'new',
      submittedAt: new Date(NOW.getTime() - 2 * HOUR),
      contactName: 'Olive Thompson',
      interest: 'Violin',
      studentAge: 6,
      formName: 'Suzuki form',
    },
  ]);
  mocks.findMembers.mockResolvedValue([
    {
      id: 'm-1',
      status: 'requested',
      name: 'Test Member',
      email: 'member@example.com',
      createdAt: new Date(NOW.getTime() - 24 * HOUR),
      updatedAt: new Date(NOW.getTime() - 24 * HOUR),
    },
  ]);
  mocks.findAgreements.mockResolvedValue([
    { id: 'r-1', status: 'pending', classId: 'cls-1', createdAt: new Date(NOW.getTime() - 72 * HOUR) },
    { id: 'r-2', status: 'pending', classId: 'cls-1', createdAt: new Date(NOW.getTime() - 24 * HOUR) },
    { id: 'r-3', status: 'pending', classId: 'cls-gone', createdAt: new Date(NOW.getTime() - 24 * HOUR) },
    { id: 'r-4', status: 'pending', createdAt: new Date(NOW.getTime() - 24 * HOUR) },
  ]);
  mocks.findClass.mockImplementation(async (id: string) =>
    id === 'cls-1'
      ? {
          id,
          name: 'Stained Glass',
          sessions: [{ dateTime: new Date('2026-10-14T22:00:00Z') }],
        }
      : undefined
  );
  mocks.findPendingConflicts.mockResolvedValue([]);
  mocks.findDismissals.mockResolvedValue([]);
  mocks.findWithRefunds.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getInbox', () => {
  it('reads the whole studio and only what each kind needs', async () => {
    await getInbox();
    expect(mocks.collectNeedsAttention).toHaveBeenCalledWith(undefined, NOW);
    expect(mocks.findInquiries).toHaveBeenCalledWith({ status: 'new' });
    expect(mocks.findAgreements).toHaveBeenCalledWith({ status: 'pending' });
    // Each named class once; requests with no class name nothing.
    expect(mocks.findClass.mock.calls.map(([id]) => id).sort()).toEqual([
      'cls-1',
      'cls-gone',
    ]);
  });

  it('returns every kind, most urgent first', async () => {
    const { items } = await getInbox();
    expect(items.map((i) => i.kind)).toEqual([
      'charge-failed',
      'agreement-unsigned',
      'lesson-inquiry',
      'lesson-unbilled',
      'craft-club-requested',
    ]);
    expect(items[0]).toMatchObject({
      title: 'Robin Ashfield · $35',
      detail: 'Card declined · next lesson Wed, Oct 21',
      href: '/students/stu-1',
    });
    expect(items[1].title).toBe('2 for tonight’s Stained Glass');
  });

  it('asks about exactly the keys it would show, and drops dismissed ones', async () => {
    mocks.findDismissals.mockImplementation(async (keys: string[]) =>
      keys
        .filter((k) => k.startsWith('lesson-inquiry:') || k.startsWith('craft-club'))
        .map((key) => ({ key, kind: 'lesson-inquiry', dismissedAt: NOW }))
    );
    const { items } = await getInbox();
    const asked = mocks.findDismissals.mock.calls[0][0] as string[];
    expect(asked).toHaveLength(5);
    expect(items.map((i) => i.kind)).toEqual([
      'charge-failed',
      'agreement-unsigned',
      'lesson-unbilled',
    ]);
  });

  it('includes pending sync conflicts as one row', async () => {
    mocks.findPendingConflicts.mockResolvedValue([
      { detectedAt: new Date(NOW.getTime() - HOUR) },
      { detectedAt: new Date(NOW.getTime() - 2 * HOUR) },
    ]);
    const { items } = await getInbox();
    expect(items.filter((i) => i.kind === 'sync-conflicts')).toHaveLength(1);
  });

  it('lists an open partial refund with its class name, and reads only that class', async () => {
    mocks.findAgreements.mockResolvedValue([]);
    mocks.findWithRefunds.mockResolvedValue([
      {
        id: 'reg-part',
        classId: 'cls-pottery',
        customerName: 'Test Student',
        status: 'confirmed',
        pricePaidCents: 6360,
        refundedAmountCents: 2000,
        lastRefundAt: new Date(NOW.getTime() - HOUR),
        updatedAt: new Date(NOW.getTime() - HOUR),
      },
      {
        id: 'reg-full',
        classId: 'cls-other',
        status: 'refunded',
        pricePaidCents: 6360,
        refundedAmountCents: 6360,
        updatedAt: new Date(NOW.getTime() - HOUR),
      },
    ]);
    mocks.findClass.mockImplementation(async (id: string) =>
      id === 'cls-pottery' ? { id, name: 'Wheel Pottery', sessions: [] } : undefined
    );

    const { items } = await getInbox();

    // A full refund is done: its class is not even read.
    expect(mocks.findClass.mock.calls.map(([id]) => id)).toEqual(['cls-pottery']);
    expect(items.find((i) => i.kind === 'refund-partial')).toMatchObject({
      key: 'refund-partial:reg-part:2000',
      title: 'Wheel Pottery',
      detail: '$20.00 of $63.60 refunded in Square · Test Student',
      href: '/classes/cls-pottery/roster',
    });
  });

  it('is empty when nothing needs doing', async () => {
    mocks.collectNeedsAttention.mockResolvedValue({
      groups: [],
      students: [],
      lessons: [],
      charges: [],
    });
    mocks.findInquiries.mockResolvedValue([]);
    mocks.findMembers.mockResolvedValue([]);
    mocks.findAgreements.mockResolvedValue([]);
    expect(await getInbox()).toEqual({ items: [] });
    expect(mocks.findClass).not.toHaveBeenCalled();
  });
});
