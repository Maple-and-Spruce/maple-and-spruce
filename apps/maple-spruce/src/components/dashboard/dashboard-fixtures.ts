/**
 * Invented dashboard data for the view-model spec and the card stories (#235).
 * Every person here is made up. Dates are built from local wall-clock parts so
 * the fixtures read the same in any timezone.
 */
import type { Class, InboxItem, Registration } from '@maple/ts/domain';
import type {
  StudioDayLesson,
  StudioDayPayment,
} from '@maple/ts/firebase/api-types';

/** Wednesday, October 14, 2026, 3:10 PM local. */
export const FIXTURE_NOW = new Date(2026, 9, 14, 15, 10);

function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 9, day, hour, minute);
}

function studioLesson(
  id: string,
  start: Date,
  studentName: string,
  teacherName: string,
  payment: StudioDayPayment,
  extra: { instrument?: string; virtual?: boolean; durationMinutes?: number } = {},
): StudioDayLesson {
  return {
    lesson: {
      id,
      studentId: `stu-${id}`,
      teacherId: `instr-${teacherName.split(' ')[0].toLowerCase()}`,
      scheduledAt: start,
      durationMinutes: extra.durationMinutes ?? 30,
      status: 'scheduled',
      virtual: extra.virtual,
      createdAt: at(1, 9),
      updatedAt: at(1, 9),
    },
    studentName,
    teacherName,
    instrument: extra.instrument,
    payment,
  };
}

export const fixtureStudioDay: StudioDayLesson[] = [
  studioLesson('les-1', at(14, 13), 'Olive Thompson', 'Ada Teacher', { state: 'paid' }, { instrument: 'Violin' }),
  studioLesson('les-2', at(14, 14), 'Robin Ashfield', 'Ben Teacher', { state: 'paid' }, { instrument: 'Guitar' }),
  studioLesson(
    'les-3',
    at(14, 15),
    'Milo Fairbanks',
    'Ben Teacher',
    { state: 'scheduled', dueAt: at(16, 10).toISOString() },
    { instrument: 'Fiddle' },
  ),
  studioLesson(
    'les-4',
    at(14, 16),
    'Hazel Pemberton',
    'Ada Teacher',
    { state: 'failed' },
    { instrument: 'Harp', virtual: true, durationMinutes: 45 },
  ),
  studioLesson('les-5', at(14, 16, 30), 'Quinn Larkspur', 'Ada Teacher', { state: 'waived' }),
  studioLesson('les-6', at(14, 17, 30), 'Theo Marchetti', 'Ben Teacher', { state: 'unbilled' }, { instrument: 'Violin' }),
];

function klass(
  id: string,
  name: string,
  sessions: Date[],
  capacity: number,
  priceCents: number,
  status: Class['status'] = 'published',
): Class {
  return {
    id,
    name,
    description: 'An invented class.',
    sessions: sessions.map((dateTime) => ({ dateTime })),
    durationMinutes: 120,
    capacity,
    priceCents,
    skillLevel: 'beginner',
    status,
    createdAt: at(1, 9),
    updatedAt: at(1, 9),
  } as Class;
}

export const fixtureClasses: Class[] = [
  klass('cls-wheel', 'Wheel Throwing Basics', [at(14, 18)], 8, 9500),
  klass('cls-weave', 'Beginner Weaving on a Rigid Heddle Loom', [at(15, 18)], 10, 4000),
  klass('cls-spoon', 'Spoon Carving', [at(17, 10)], 6, 6500),
  klass('cls-draft', 'Draft Class', [at(15, 12)], 6, 3000, 'draft'),
  klass('cls-later', 'Winter Wreaths', [new Date(2026, 11, 5, 13)], 12, 5500),
];

function registration(
  id: string,
  classId: string,
  customerName: string,
  createdAt: Date,
  pricePaidCents: number,
  extra: Partial<Registration> = {},
): Registration {
  return {
    id,
    classId,
    customerName,
    customerEmail: `${id}@example.com`,
    quantity: 1,
    pricePaidCents,
    subtotalCents: pricePaidCents,
    taxAmountCents: 0,
    taxRatePercent: 6,
    status: 'confirmed',
    source: 'web',
    createdAt,
    updatedAt: createdAt,
    ...extra,
  } as Registration;
}

export const fixtureRegistrations: Registration[] = [
  registration('reg-1', 'cls-wheel', 'Avery Holloway', at(14, 14, 5), 9500),
  registration('reg-2', 'cls-weave', 'Jun Castellano', at(14, 9, 30), 4000, { status: 'pending' }),
  registration('reg-3', 'cls-wheel', 'Priya Wexford', at(13, 20), 19000, { quantity: 2 }),
  registration('reg-4', 'cls-spoon', 'Dmitri Oakley', at(12, 11), 6500),
  registration('reg-5', 'cls-wheel', 'Sage Whitcombe', at(11, 16), 9500),
  registration('reg-6', 'cls-spoon', 'Lena Brightwater', at(9, 10), 6500),
  registration('reg-7', 'cls-spoon', 'Owen Thistlewood', at(8, 15), 6500, { quantity: 2 }),
  // Outside the week, and not holding a seat: neither counts as recent.
  registration('reg-8', 'cls-wheel', 'Ivy Old', at(1, 12), 9500),
  registration('reg-9', 'cls-weave', 'Cal Cancelled', at(14, 8), 4000, { status: 'cancelled' }),
];

// ---------------------------------------------------------------------------
// Inbox (#235)
// ---------------------------------------------------------------------------

const iso = (d: Date) => d.toISOString();

/** Seven inbox items, already in the server's order. All invented. */
export const fixtureInboxItems: InboxItem[] = [
  {
    key: 'charge-failed:chg-iris:1760400000000',
    kind: 'charge-failed',
    title: 'Iris Calloway · $35',
    detail: 'Card declined · lesson today at 3:30 PM',
    href: '/students/stu-iris',
    actionLabel: 'Retry charge',
    occurredAt: iso(at(13, 9)),
    urgent: true,
  },
  {
    key: 'agreement-unsigned:cls-glass:1760479200000:1760300000000',
    kind: 'agreement-unsigned',
    title: '2 for tonight’s Stained Glass',
    detail: 'Wed, Oct 14 · 6:00 PM',
    href: '/agreements',
    actionLabel: 'Send reminder',
    occurredAt: iso(at(12, 10)),
    dueAt: iso(at(14, 18)),
    urgent: true,
  },
  {
    key: 'lesson-inquiry:inq-priya',
    kind: 'lesson-inquiry',
    title: 'Priya Okafor',
    detail: 'Cello · age 9 · Lessons form',
    href: '/leads',
    actionLabel: 'Reply',
    occurredAt: iso(at(10, 11)),
    urgent: true,
  },
  {
    key: 'lesson-inquiry:inq-mara',
    kind: 'lesson-inquiry',
    title: 'Mara Linden',
    detail: 'Violin · age 6 · Suzuki form',
    href: '/leads',
    actionLabel: 'Reply',
    occurredAt: iso(at(14, 13, 10)),
    urgent: false,
  },
  {
    key: 'craft-club-requested:mem-wren',
    kind: 'craft-club-requested',
    title: 'Wren Abernathy',
    detail: 'Wants to join Craft Club',
    href: '/craft-club',
    actionLabel: 'Review',
    occurredAt: iso(at(12, 16)),
    urgent: false,
  },
  {
    key: 'lesson-unbilled:les-theo:1760140800000',
    kind: 'lesson-unbilled',
    title: 'Theo Marsh',
    detail: 'Taught Oct 9, 2026, never invoiced',
    href: '/students/stu-theo?chargeLesson=les-theo',
    actionLabel: 'Bill',
    occurredAt: iso(at(9, 16)),
    urgent: false,
  },
  {
    key: 'sync-conflicts:2:1760450000000',
    kind: 'sync-conflicts',
    title: '2 inventory sync conflicts',
    detail: 'Square or Etsy disagrees with the portal',
    href: '/sync-conflicts',
    actionLabel: 'Review',
    occurredAt: iso(at(14, 9)),
    urgent: false,
  },
];
