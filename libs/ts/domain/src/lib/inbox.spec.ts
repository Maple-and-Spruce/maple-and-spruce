import { describe, it, expect } from 'vitest';
import {
  INBOX_INSTRUCTOR_READINESS_WINDOW_DAYS,
  INBOX_KIND_LABELS,
  INBOX_UNDER_MINIMUM_WINDOW_DAYS,
  buildInboxItems,
  classesForMinimumCheck,
  inboxKindOfKey,
  inboxRank,
  isWellFormedInboxKey,
  nextSessionAt,
  sortInboxItems,
  withoutDismissed,
} from './inbox';
import type { InboxItem, InboxMinimumClass, InboxSources } from './inbox';
import type { NeedsAttentionGroup } from './needs-attention';

/** Wednesday Oct 14 2026, 3:10 PM in New York. All people are invented. */
const NOW = new Date('2026-10-14T19:10:00Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ago = (msAgo: number) => new Date(NOW.getTime() - msAgo);
const ahead = (msAhead: number) => new Date(NOW.getTime() + msAhead);

function sources(overrides: Partial<InboxSources> = {}): InboxSources {
  return {
    now: NOW,
    inquiries: [],
    charges: [],
    studentNames: new Map(),
    nextLessonAt: new Map(),
    craftClubMembers: [],
    agreementRequests: [],
    classes: [],
    needsAttention: [],
    syncConflicts: [],
    instructorsNotReady: [],
    minimumClasses: [],
    confirmedSeats: new Map(),
    timeZone: 'America/New_York',
    ...overrides,
  };
}

const inquiry = (
  id: string,
  submittedAt: Date,
  status: 'new' | 'contacted' | 'lost' = 'new'
) => ({
  id,
  status,
  submittedAt,
  contactName: `Contact ${id}`,
  interest: 'Suzuki violin',
  studentAge: 6,
  formName: 'Suzuki form',
});

const charge = (
  id: string,
  status: 'failed' | 'paid' | 'scheduled' | 'waived',
  resolvedAt?: Date
) => ({
  id,
  status,
  studentId: 'stu-1',
  amountCents: 3500,
  lastError: 'Card declined',
  resolvedAt,
  updatedAt: resolvedAt ?? ago(DAY),
});

const member = (
  id: string,
  status: 'requested' | 'past_due' | 'active' | 'cancelled'
) => ({
  id,
  status,
  name: `Member ${id}`,
  email: `${id}@example.com`,
  createdAt: ago(2 * DAY),
  updatedAt: ago(DAY),
});

const request = (
  id: string,
  classId: string | undefined,
  status: 'pending' | 'signed' = 'pending',
  createdAt = ago(3 * DAY)
) => ({ id, status, classId, createdAt });

function group(
  kind: NeedsAttentionGroup['kind'],
  rows: Array<{ id: string; occurredAt?: Date }>
): NeedsAttentionGroup {
  return {
    kind,
    title: kind,
    because: '',
    rows: rows.map((r) => ({
      kind,
      id: r.id,
      label: 'Test Student',
      detail: 'detail',
      href: `/students/stu-1`,
      resolution: 'navigate',
      occurredAt: r.occurredAt?.toISOString(),
    })),
  };
}

const keys = (items: InboxItem[]) => items.map((i) => i.key);

describe('lesson inquiries', () => {
  it('lists only new inquiries, as a Reply to the leads page', () => {
    const items = buildInboxItems(
      sources({
        inquiries: [
          inquiry('a', ago(2 * HOUR)),
          inquiry('b', ago(HOUR), 'contacted'),
          inquiry('c', ago(HOUR), 'lost'),
        ],
      })
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'lesson-inquiry:a',
      kind: 'lesson-inquiry',
      title: 'Contact a',
      detail: 'Suzuki violin · age 6 · Suzuki form',
      href: '/leads',
      actionLabel: 'Reply',
      occurredAt: ago(2 * HOUR).toISOString(),
      urgent: false,
    });
  });

  it('flags one waiting three days as stale (urgent)', () => {
    const [item] = buildInboxItems(
      sources({ inquiries: [inquiry('a', ago(3 * DAY))] })
    );
    expect(item.urgent).toBe(true);
  });

  it('leaves out detail parts the form did not ask', () => {
    const [item] = buildInboxItems(
      sources({
        inquiries: [
          { ...inquiry('a', ago(HOUR)), interest: undefined, studentAge: undefined },
        ],
      })
    );
    expect(item.detail).toBe('Suzuki form');
  });

  it('folds new inquiries older than 30 days into one summary row', () => {
    const items = buildInboxItems(
      sources({
        inquiries: [
          inquiry('recent', ago(29 * DAY)),
          inquiry('old1', ago(31 * DAY)),
          inquiry('old2', ago(45 * DAY)),
          inquiry('old-contacted', ago(60 * DAY), 'contacted'),
        ],
      })
    );
    expect(keys(items)).toContain('lesson-inquiry:recent');
    expect(keys(items)).not.toContain('lesson-inquiry:old1');
    const summary = items.find((i) => i.kind === 'lesson-inquiries-older');
    expect(summary).toMatchObject({
      key: 'lesson-inquiries-older:2:old1',
      title: '2 older inquiries never contacted',
      detail: 'Oldest from Sun, Aug 30',
      href: '/leads',
      actionLabel: 'Review',
      urgent: false,
    });
  });

  it('says "inquiry" for a single older one', () => {
    const items = buildInboxItems(
      sources({ inquiries: [inquiry('old', ago(40 * DAY))] })
    );
    expect(items[0].title).toBe('1 older inquiry never contacted');
  });
});

describe('failed lesson charges', () => {
  it('lists only failed charges, keyed on when they failed', () => {
    const failedAt = ago(5 * HOUR);
    const items = buildInboxItems(
      sources({
        charges: [
          charge('chg-1', 'failed', failedAt),
          charge('chg-2', 'paid', ago(HOUR)),
          charge('chg-3', 'scheduled'),
          charge('chg-4', 'waived', ago(HOUR)),
        ],
        studentNames: new Map([['stu-1', 'Robin Ashfield']]),
      })
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: `charge-failed:chg-1:${failedAt.getTime()}`,
      kind: 'charge-failed',
      title: 'Robin Ashfield · $35',
      detail: 'Card declined',
      href: '/students/stu-1',
      actionLabel: 'Retry charge',
      urgent: true,
    });
  });

  it('names the next lesson: today with its time, else its date', () => {
    const today = buildInboxItems(
      sources({
        charges: [charge('chg-1', 'failed', ago(HOUR))],
        nextLessonAt: new Map([['stu-1', new Date('2026-10-14T19:30:00Z')]]),
      })
    );
    expect(today[0].detail).toBe('Card declined · lesson today at 3:30 PM');

    const later = buildInboxItems(
      sources({
        charges: [charge('chg-1', 'failed', ago(HOUR))],
        nextLessonAt: new Map([['stu-1', new Date('2026-10-20T19:30:00Z')]]),
      })
    );
    expect(later[0].detail).toBe('Card declined · next lesson Tue, Oct 20');
  });

  it('falls back to "Unknown student", cents and a clipped error', () => {
    const [item] = buildInboxItems(
      sources({
        charges: [
          {
            ...charge('chg-1', 'failed', ago(HOUR)),
            amountCents: 3550,
            lastError: `${'x'.repeat(80)}\nstack`,
          },
        ],
      })
    );
    expect(item.title).toBe('Unknown student · $35.50');
    expect(item.detail).toHaveLength(58);
    expect(item.detail?.endsWith('…')).toBe(true);
  });

  it('resurfaces a dismissed charge that fails again', () => {
    const first = buildInboxItems(
      sources({ charges: [charge('chg-1', 'failed', ago(2 * DAY))] })
    );
    const dismissed = new Set(keys(first));
    expect(withoutDismissed(first, dismissed)).toEqual([]);

    // Retried, failed again: a new failure time, so a new key.
    const again = buildInboxItems(
      sources({ charges: [charge('chg-1', 'failed', ago(HOUR))] })
    );
    expect(withoutDismissed(again, dismissed)).toHaveLength(1);
  });

  it('uses updatedAt when a failure has no resolvedAt', () => {
    const [item] = buildInboxItems(
      sources({ charges: [{ ...charge('chg-1', 'failed'), resolvedAt: undefined }] })
    );
    expect(item.key).toBe(`charge-failed:chg-1:${ago(DAY).getTime()}`);
  });
});

describe('Craft Club', () => {
  it('lists past-due and requested members, nobody else', () => {
    const items = buildInboxItems(
      sources({
        craftClubMembers: [
          member('m1', 'past_due'),
          member('m2', 'requested'),
          member('m3', 'active'),
          member('m4', 'cancelled'),
        ],
      })
    );
    const byKind = Object.fromEntries(items.map((i) => [i.kind, i]));
    expect(Object.keys(byKind).sort()).toEqual([
      'craft-club-past-due',
      'craft-club-requested',
    ]);
    expect(byKind['craft-club-past-due']).toMatchObject({
      key: `craft-club-past-due:m1:${ago(DAY).getTime()}`,
      title: 'Member m1',
      detail: 'Craft Club payment failed',
      href: '/craft-club',
      actionLabel: 'Review',
    });
    expect(byKind['craft-club-requested']).toMatchObject({
      key: 'craft-club-requested:m2',
      detail: 'Wants to join Craft Club',
      occurredAt: ago(2 * DAY).toISOString(),
    });
  });

  it('falls back to the email when a member has no name', () => {
    const [item] = buildInboxItems(
      sources({ craftClubMembers: [{ ...member('m1', 'requested'), name: ' ' }] })
    );
    expect(item.title).toBe('m1@example.com');
  });
});

describe('unsigned agreements', () => {
  const tonight = new Date('2026-10-14T22:00:00Z'); // 6:00 PM local
  const classes = [
    { id: 'cls-tonight', name: 'Stained Glass', sessions: [{ dateTime: tonight }] },
    {
      id: 'cls-sat',
      name: 'Wheel Throwing',
      // A past session is ignored; the next is Saturday.
      sessions: [
        { dateTime: ago(7 * DAY) },
        { dateTime: new Date('2026-10-17T17:00:00Z') },
      ],
    },
    { id: 'cls-far', name: 'Far Off', sessions: [{ dateTime: ahead(8 * DAY) }] },
    { id: 'cls-past', name: 'Done', sessions: [{ dateTime: ago(DAY) }] },
  ];

  it('groups pending requests per class meeting within 7 days', () => {
    const items = buildInboxItems(
      sources({
        classes,
        agreementRequests: [
          request('r1', 'cls-tonight'),
          request('r2', 'cls-tonight', 'pending', ago(DAY)),
          request('r3', 'cls-tonight', 'signed'),
          request('r4', 'cls-sat'),
          request('r5', 'cls-far'),
          request('r6', 'cls-past'),
          request('r7', undefined),
          request('r8', 'cls-missing'),
        ],
      })
    );
    expect(items.map((i) => i.title)).toEqual([
      '2 for tonight’s Stained Glass',
      '1 for Saturday’s Wheel Throwing',
    ]);
    expect(items[0]).toMatchObject({
      key: `agreement-unsigned:cls-tonight:${tonight.getTime()}:${ago(DAY).getTime()}`,
      detail: 'Wed, Oct 14 · 6:00 PM',
      href: '/agreements',
      actionLabel: 'Send reminder',
      dueAt: tonight.toISOString(),
      urgent: true,
    });
    // Saturday is more than 48 hours off.
    expect(items[1].urgent).toBe(false);
  });

  it('says today’s for a daytime class and tomorrow’s for tomorrow', () => {
    const items = buildInboxItems(
      sources({
        classes: [
          { id: 'a', name: 'Morning', sessions: [{ dateTime: new Date('2026-10-14T20:00:00Z') }] },
          { id: 'b', name: 'Next', sessions: [{ dateTime: new Date('2026-10-15T22:00:00Z') }] },
        ],
        agreementRequests: [request('r1', 'a'), request('r2', 'b')],
      })
    );
    expect(items.map((i) => i.title)).toEqual([
      '1 for today’s Morning',
      '1 for tomorrow’s Next',
    ]);
  });

  it('keeps a dismissal when someone signs, resurfaces on a new request', () => {
    const base = sources({
      classes,
      agreementRequests: [
        request('r1', 'cls-tonight', 'pending', ago(3 * DAY)),
        request('r2', 'cls-tonight', 'pending', ago(2 * DAY)),
      ],
    });
    const dismissed = new Set(keys(buildInboxItems(base)));

    const oneSigned = buildInboxItems({
      ...base,
      agreementRequests: [
        request('r1', 'cls-tonight', 'signed', ago(3 * DAY)),
        request('r2', 'cls-tonight', 'pending', ago(2 * DAY)),
      ],
    });
    expect(withoutDismissed(oneSigned, dismissed)).toEqual([]);

    const newOne = buildInboxItems({
      ...base,
      agreementRequests: [
        ...base.agreementRequests,
        request('r3', 'cls-tonight', 'pending', ago(HOUR)),
      ],
    });
    expect(withoutDismissed(newOne, dismissed)).toHaveLength(1);
  });

  it('nextSessionAt picks the earliest session not yet started', () => {
    expect(nextSessionAt(classes[1], NOW)).toEqual(new Date('2026-10-17T17:00:00Z'));
    expect(nextSessionAt(classes[3], NOW)).toBeUndefined();
  });
});

describe('needs-attention rows', () => {
  it('maps each kind to an action, keeping the row link', () => {
    const items = buildInboxItems(
      sources({
        needsAttention: [
          group('lesson-unbilled', [{ id: 'les-1', occurredAt: ago(3 * DAY) }]),
          group('invoice-overdue', [{ id: 'inv-1', occurredAt: ago(20 * DAY) }]),
          group('invoice-sync-failed', [{ id: 'inv-2', occurredAt: ago(DAY) }]),
          group('hope-unsubmitted', [{ id: 'les-2', occurredAt: ago(40 * DAY) }]),
          group('lesson-unattributed', [{ id: 'les-3', occurredAt: ago(DAY) }]),
        ],
      })
    );
    const byKind = Object.fromEntries(items.map((i) => [i.kind, i]));
    expect(byKind['lesson-unbilled']).toMatchObject({
      key: `lesson-unbilled:les-1:${ago(3 * DAY).getTime()}`,
      actionLabel: 'Bill',
      href: '/students/stu-1',
      title: 'Test Student',
      detail: 'detail',
    });
    expect(byKind['invoice-overdue'].actionLabel).toBe('Review');
    expect(byKind['invoice-sync-failed']).toMatchObject({
      actionLabel: 'Review',
      urgent: true,
    });
    // Hope claims are not lesson-window limited: the state still owes them.
    expect(byKind['hope-unsubmitted'].actionLabel).toBe('Submit');
    expect(byKind['lesson-unattributed'].actionLabel).toBe('Review');
  });

  it('only chases unbilled and blockless lessons from the last 14 days', () => {
    const items = buildInboxItems(
      sources({
        needsAttention: [
          group('lesson-unbilled', [
            { id: 'recent', occurredAt: ago(13 * DAY) },
            { id: 'old', occurredAt: ago(15 * DAY) },
            { id: 'undated' },
          ]),
          group('lesson-unattributed', [
            { id: 'soon', occurredAt: ahead(3 * DAY) },
            { id: 'stale', occurredAt: ago(30 * DAY) },
          ]),
        ],
      })
    );
    expect(keys(items).map((k) => k.split(':')[1]).sort()).toEqual([
      'recent',
      'soon',
    ]);
  });

  it('ages an undated row from now and keys it on the record alone', () => {
    const items = buildInboxItems(
      sources({ needsAttention: [group('invoice-overdue', [{ id: 'inv-1' }])] })
    );
    expect(items[0]).toMatchObject({
      key: 'invoice-overdue:inv-1',
      occurredAt: NOW.toISOString(),
    });
  });
});

describe('sync conflicts', () => {
  it('is one row for all pending conflicts, absent when there are none', () => {
    expect(buildInboxItems(sources())).toEqual([]);
    const items = buildInboxItems(
      sources({
        syncConflicts: [{ detectedAt: ago(2 * DAY) }, { detectedAt: ago(HOUR) }],
      })
    );
    expect(items).toEqual([
      expect.objectContaining({
        key: `sync-conflicts:2:${ago(HOUR).getTime()}`,
        title: '2 inventory sync conflicts',
        href: '/sync-conflicts',
        actionLabel: 'Review',
      }),
    ]);
    const one = buildInboxItems(sources({ syncConflicts: [{ detectedAt: ago(HOUR) }] }));
    expect(one[0].title).toBe('1 inventory sync conflict');
  });
});

describe('sorting', () => {
  it('failed charges, urgent agreements, stale then new inquiries, then the rest by age', () => {
    const items = buildInboxItems(
      sources({
        inquiries: [inquiry('fresh', ago(HOUR)), inquiry('stale', ago(4 * DAY))],
        charges: [charge('chg-1', 'failed', ago(10 * DAY))],
        classes: [
          { id: 'soon', name: 'Soon', sessions: [{ dateTime: ahead(5 * HOUR) }] },
          { id: 'later', name: 'Later', sessions: [{ dateTime: ahead(5 * DAY) }] },
        ],
        agreementRequests: [request('r1', 'soon'), request('r2', 'later')],
        craftClubMembers: [member('m1', 'requested')],
        needsAttention: [group('invoice-overdue', [{ id: 'inv-1', occurredAt: ago(20 * DAY) }])],
        syncConflicts: [{ detectedAt: ago(HOUR) }],
      })
    );
    expect(items.map((i) => i.kind)).toEqual([
      'charge-failed',
      'agreement-unsigned', // within 48h
      'lesson-inquiry', // stale
      'lesson-inquiry', // new
      'agreement-unsigned', // has a deadline, so first among the rest
      'invoice-overdue', // 20 days
      'craft-club-requested', // 2 days
      'sync-conflicts', // 1 hour
    ]);
    expect(items[2].key).toBe('lesson-inquiry:stale');
  });

  it('ranks by kind and urgency', () => {
    expect(inboxRank({ kind: 'charge-failed', urgent: true })).toBe(0);
    expect(inboxRank({ kind: 'agreement-unsigned', urgent: true })).toBe(1);
    expect(inboxRank({ kind: 'agreement-unsigned', urgent: false })).toBe(4);
    expect(inboxRank({ kind: 'lesson-inquiry', urgent: true })).toBe(2);
    expect(inboxRank({ kind: 'lesson-inquiry', urgent: false })).toBe(3);
    expect(inboxRank({ kind: 'sync-conflicts', urgent: false })).toBe(4);
  });

  it('orders deadlines soonest first and ties by key', () => {
    const base = {
      kind: 'agreement-unsigned' as const,
      title: '',
      href: '/',
      actionLabel: '',
      occurredAt: NOW.toISOString(),
      urgent: false,
    };
    const sorted = sortInboxItems([
      { ...base, key: 'b', dueAt: ahead(3 * DAY).toISOString() },
      { ...base, key: 'a', dueAt: ahead(4 * DAY).toISOString() },
      { ...base, kind: 'sync-conflicts', key: 'd' },
      { ...base, kind: 'sync-conflicts', key: 'c' },
    ]);
    expect(keys(sorted)).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('dismissals', () => {
  it('filters dismissed keys and leaves the rest in order', () => {
    const items = buildInboxItems(
      sources({ inquiries: [inquiry('a', ago(2 * HOUR)), inquiry('b', ago(HOUR))] })
    );
    expect(keys(withoutDismissed(items, new Set(['lesson-inquiry:a'])))).toEqual([
      'lesson-inquiry:b',
    ]);
  });

  it('accepts only well-formed keys', () => {
    expect(isWellFormedInboxKey('charge-failed:chg-1:123')).toBe(true);
    expect(isWellFormedInboxKey('lesson-inquiry:abc')).toBe(true);
    expect(isWellFormedInboxKey('')).toBe(false);
    expect(isWellFormedInboxKey('no-colon')).toBe(false);
    expect(isWellFormedInboxKey('a:b/c')).toBe(false);
    expect(isWellFormedInboxKey('a:b c')).toBe(false);
    expect(isWellFormedInboxKey('Upper:b')).toBe(false);
    expect(isWellFormedInboxKey(`a:${'x'.repeat(400)}`)).toBe(false);
    expect(isWellFormedInboxKey(42)).toBe(false);
  });

  it('reads the kind back off a key', () => {
    expect(inboxKindOfKey('charge-failed:chg-1:1')).toBe('charge-failed');
    expect(inboxKindOfKey('lesson-inquiries-older:2:x')).toBe('lesson-inquiries-older');
    expect(inboxKindOfKey('mystery:1')).toBeUndefined();
  });

  it('labels every kind', () => {
    for (const label of Object.values(INBOX_KIND_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('uncleared contract instructors', () => {
  const entry = (id: string, at: Date) => ({
    instructor: { id, name: 'Robin Ashfield' },
    missing: ['background-check' as const, 'payment-setup' as const],
    nextSessionAt: at,
    nextClass: { id: `class-${id}`, name: 'Stained Glass Basics' },
  });

  it('lists one inside the window, linking to their form', () => {
    const at = ahead(10 * DAY);
    const [item] = buildInboxItems(sources({ instructorsNotReady: [entry('i1', at)] }));

    expect(item).toMatchObject({
      key: `instructor-not-ready:i1:${at.getTime()}`,
      kind: 'instructor-not-ready',
      detail: 'Missing background check and payment setup',
      href: '/instructors?edit=i1',
      actionLabel: 'Update',
      dueAt: at.toISOString(),
      urgent: false,
    });
    expect(item.title).toMatch(/^Robin Ashfield for .+’s Stained Glass Basics$/);
  });

  it('leaves out a class further off than the window, or already started', () => {
    expect(
      buildInboxItems(
        sources({
          instructorsNotReady: [
            entry('far', ahead((INBOX_INSTRUCTOR_READINESS_WINDOW_DAYS + 1) * DAY)),
            entry('past', ago(HOUR)),
          ],
        })
      )
    ).toEqual([]);
  });

  it('is urgent inside a week and ranks with urgent agreements, above inquiries', () => {
    const items = buildInboxItems(
      sources({
        inquiries: [inquiry('q1', ago(HOUR))],
        instructorsNotReady: [entry('soon', ahead(3 * DAY))],
      })
    );

    expect(items.map((i) => i.kind)).toEqual(['instructor-not-ready', 'lesson-inquiry']);
    expect(items[0].urgent).toBe(true);
    expect(inboxRank(items[0])).toBe(1);
  });

  it('builds a key the dismissal route accepts', () => {
    const [item] = buildInboxItems(
      sources({ instructorsNotReady: [entry('i1', ahead(2 * DAY))] })
    );
    expect(isWellFormedInboxKey(item.key)).toBe(true);
    expect(inboxKindOfKey(item.key)).toBe('instructor-not-ready');
  });
});

describe('classes under their minimum', () => {
  const cls = (
    overrides: Partial<InboxMinimumClass> & { firstIn?: number } = {}
  ): InboxMinimumClass => {
    const { firstIn = 2 * DAY, ...rest } = overrides;
    return {
      id: 'cls-1',
      name: 'Block Printing',
      status: 'published',
      minimumEnrollment: 4,
      sessions: [{ dateTime: ahead(firstIn) }, { dateTime: ahead(firstIn + 7 * DAY) }],
      ...rest,
    };
  };
  const build = (classes: InboxMinimumClass[], seats: Record<string, number> = {}) =>
    buildInboxItems(
      sources({ minimumClasses: classes, confirmedSeats: new Map(Object.entries(seats)) })
    ).filter((i) => i.kind === 'class-under-minimum');

  it('lists a published class short of its minimum within the window', () => {
    const [item] = build([cls()], { 'cls-1': 1 });
    expect(item).toEqual({
      key: `class-under-minimum:cls-1:${ahead(2 * DAY).getTime()}`,
      kind: 'class-under-minimum',
      title: 'Friday’s Block Printing',
      detail: '1 of 4 needed · Fri, Oct 16 · 3:10 PM',
      href: '/classes/cls-1/roster',
      actionLabel: 'Review',
      occurredAt: new Date(ahead(2 * DAY).getTime() - INBOX_UNDER_MINIMUM_WINDOW_DAYS * DAY).toISOString(),
      dueAt: ahead(2 * DAY).toISOString(),
      urgent: true,
    });
    expect(INBOX_KIND_LABELS['class-under-minimum']).toBe('Under minimum');
  });

  it('counts a class with no confirmed seats as zero', () => {
    expect(build([cls()])[0].detail).toMatch(/^0 of 4 needed/);
  });

  it('leaves once the minimum is met', () => {
    expect(build([cls()], { 'cls-1': 4 })).toEqual([]);
    expect(build([cls()], { 'cls-1': 6 })).toEqual([]);
  });

  it('is not urgent until three days out', () => {
    expect(build([cls({ firstIn: 3 * DAY })])[0].urgent).toBe(true);
    expect(build([cls({ firstIn: 3 * DAY + HOUR })])[0].urgent).toBe(false);
  });

  it('only covers the week before the first session', () => {
    expect(build([cls({ firstIn: 7 * DAY })])).toHaveLength(1);
    expect(build([cls({ firstIn: 7 * DAY + HOUR })])).toEqual([]);
    // Started already: a series under its minimum is running anyway.
    expect(build([cls({ firstIn: -HOUR })])).toEqual([]);
  });

  it('ignores drafts, cancelled classes and classes with no minimum', () => {
    expect(build([cls({ status: 'draft' })])).toEqual([]);
    expect(build([cls({ status: 'cancelled' })])).toEqual([]);
    expect(build([cls({ minimumEnrollment: undefined })])).toEqual([]);
    expect(build([cls({ minimumEnrollment: null })])).toEqual([]);
    expect(build([cls({ minimumEnrollment: 0 })])).toEqual([]);
    expect(build([cls({ sessions: [] })])).toEqual([]);
  });

  it('keys on the first session, so a rescheduled class comes back after Mark done', () => {
    const [before] = build([cls({ firstIn: 2 * DAY })]);
    const [after] = build([cls({ firstIn: 4 * DAY })]);
    expect(before.key).not.toBe(after.key);
  });

  it('uses the earliest session even when they are out of order', () => {
    const [item] = build([
      cls({ sessions: [{ dateTime: ahead(9 * DAY) }, { dateTime: ahead(2 * DAY) }] }),
    ]);
    expect(item.dueAt).toBe(ahead(2 * DAY).toISOString());
  });

  it('ranks urgent rows with the other near deadlines', () => {
    expect(inboxRank({ kind: 'class-under-minimum', urgent: true })).toBe(1);
    expect(inboxRank({ kind: 'class-under-minimum', urgent: false })).toBe(4);
  });

  it('selects only the classes worth counting seats for', () => {
    const picked = classesForMinimumCheck(
      [cls({ id: 'a' }), cls({ id: 'b', status: 'draft' }), cls({ id: 'c', firstIn: 10 * DAY })],
      NOW
    );
    expect(picked.map((c) => c.id)).toEqual(['a']);
  });
});
