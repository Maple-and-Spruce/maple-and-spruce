import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  instructorIdForUser: vi.fn(),
  findByStartInRange: vi.fn(),
  findBlocks: vi.fn(),
  findLessons: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  createRoleFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>,
  ) => handler,
  instructorIdForUser: mocks.instructorIdForUser,
}));

vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: { findByStartInRange: mocks.findByStartInRange },
  LessonBlockRepository: { findAll: mocks.findBlocks },
  LessonRepository: { findAll: mocks.findLessons },
}));

import {
  getMyWeek,
  buildCommitments,
  buildStandingSlots,
  startOfWeek,
} from './get-my-week';

type Handler = (
  data: unknown,
  ctx?: unknown,
) => Promise<{
  commitments: Array<{
    id: string;
    ownership: string;
    cadence: string;
    category: string;
    unattributed: boolean;
  }>;
  standing: Array<Record<string, unknown>>;
  blocks: Array<Record<string, unknown>>;
  unlinked: boolean;
}>;
const handler = getMyWeek as unknown as Handler;

/** Minimal CalendarEvent builder (local time, so server-local keying is stable in tests). */
function event(
  partial: Partial<CalendarEvent> & { id: string; startDateTime: Date },
): CalendarEvent {
  return {
    description: '',
    endDateTime: new Date(partial.startDateTime.getTime() + 30 * 60 * 1000),
    recurrenceRule: null,
    location: '',
    type: 'lesson',
    public: false,
    room: 'spruce',
    sourceRef: null,
    ownerInstructorId: null,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    title: 'Music Lesson',
    ...partial,
  } as CalendarEvent;
}

describe('startOfWeek', () => {
  it('returns local Sunday 00:00 for a mid-week instant', () => {
    const wed = new Date(2026, 6, 22, 14, 30); // Wed Jul 22 2026
    const start = startOfWeek(wed);
    expect(start.getDay()).toBe(0);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(19); // Sun Jul 19
  });
});

describe('buildCommitments', () => {
  const from = new Date(2026, 6, 19); // Sun Jul 19
  const to = new Date(2026, 6, 26); // Sun Jul 26
  const lookbackStart = new Date(from.getTime() - 28 * 24 * 60 * 60 * 1000);
  const me = 'instr-katie';

  it("tags the caller's own event as mine and a standing weekly slot as recurring", () => {
    const events = [
      // this week (Thu 16:00) + a prior week same slot -> recurring
      event({
        id: 'k-this',
        startDateTime: new Date(2026, 6, 23, 16, 0),
        ownerInstructorId: me,
      }),
      event({
        id: 'k-prev',
        startDateTime: new Date(2026, 6, 16, 16, 0),
        ownerInstructorId: me,
      }),
    ];
    const result = buildCommitments(events, from, to, lookbackStart, me);
    // only the in-week event is returned
    expect(result.map((c) => c.id)).toEqual(['k-this']);
    expect(result[0].ownership).toBe('mine');
    expect(result[0].cadence).toBe('recurring');
  });

  it("tags another teacher's single event as shared + one-off", () => {
    const events = [
      event({
        id: 'n-once',
        startDateTime: new Date(2026, 6, 24, 10, 0),
        ownerInstructorId: 'instr-nathan',
        type: 'class',
      }),
    ];
    const result = buildCommitments(events, from, to, lookbackStart, me);
    expect(result[0].ownership).toBe('shared');
    expect(result[0].cadence).toBe('one-off');
  });

  it('recognizes a recurring shared event (weekly jam) as recurring', () => {
    const events = [
      event({
        id: 'jam-this',
        startDateTime: new Date(2026, 6, 24, 18, 0),
        type: 'jam',
        ownerInstructorId: null,
      }),
      event({
        id: 'jam-prev',
        startDateTime: new Date(2026, 6, 17, 18, 0),
        type: 'jam',
        ownerInstructorId: null,
      }),
    ];
    const result = buildCommitments(events, from, to, lookbackStart, me);
    expect(result.map((c) => c.id)).toEqual(['jam-this']);
    expect(result[0].cadence).toBe('recurring');
    expect(result[0].ownership).toBe('shared');
  });

  it('does not count two occurrences in the same week as recurring', () => {
    const events = [
      event({
        id: 'a',
        startDateTime: new Date(2026, 6, 23, 16, 0),
        ownerInstructorId: me,
      }),
      // a make-up the same week at the same slot key would still be one week
      event({
        id: 'b',
        startDateTime: new Date(2026, 6, 23, 16, 0),
        ownerInstructorId: me,
      }),
    ];
    const result = buildCommitments(events, from, to, lookbackStart, me);
    expect(result.every((c) => c.cadence === 'one-off')).toBe(true);
  });

  it('sorts commitments by start time', () => {
    const events = [
      event({
        id: 'late',
        startDateTime: new Date(2026, 6, 24, 18, 0),
        ownerInstructorId: me,
      }),
      event({
        id: 'early',
        startDateTime: new Date(2026, 6, 20, 9, 0),
        ownerInstructorId: me,
      }),
    ];
    const result = buildCommitments(events, from, to, lookbackStart, me);
    expect(result.map((c) => c.id)).toEqual(['early', 'late']);
  });
});

describe('buildStandingSlots', () => {
  // ISO-UTC instants that map to known ET wall-clock (EDT = UTC-4). Weekday /
  // time are evaluated in America/New_York by the function.
  const lookbackStart = new Date('2026-06-28T04:00:00Z');
  const me = 'instr-katie';

  it('emits one standing slot for a lesson recurring on the same ET weekday+time', () => {
    // Three consecutive Tuesdays at 3:00 PM ET.
    const events = [
      event({
        id: 'w1',
        startDateTime: new Date('2026-07-07T19:00:00Z'),
        ownerInstructorId: me,
      }),
      event({
        id: 'w2',
        startDateTime: new Date('2026-07-14T19:00:00Z'),
        ownerInstructorId: me,
      }),
      event({
        id: 'w3',
        startDateTime: new Date('2026-07-21T19:00:00Z'),
        ownerInstructorId: me,
      }),
    ];
    const slots = buildStandingSlots(events, lookbackStart, me);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      weekday: 2, // Tuesday
      startMinutes: 15 * 60,
      durationMinutes: 30,
      category: 'lesson',
      ownership: 'mine',
    });
  });

  it('excludes a one-off (seen in only one week)', () => {
    const events = [
      event({
        id: 'once',
        startDateTime: new Date('2026-07-21T19:00:00Z'),
        ownerInstructorId: me,
      }),
    ];
    expect(buildStandingSlots(events, lookbackStart, me)).toHaveLength(0);
  });

  it('marks a recurring shared event (weekly jam) as shared', () => {
    const events = [
      event({
        id: 'j1',
        startDateTime: new Date('2026-07-10T22:00:00Z'),
        type: 'jam',
        ownerInstructorId: null,
      }),
      event({
        id: 'j2',
        startDateTime: new Date('2026-07-17T22:00:00Z'),
        type: 'jam',
        ownerInstructorId: null,
      }),
    ];
    const slots = buildStandingSlots(events, lookbackStart, me);
    expect(slots).toHaveLength(1);
    expect(slots[0].ownership).toBe('shared');
    expect(slots[0].category).toBe('jam');
  });
});

describe('getMyWeek handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.instructorIdForUser.mockResolvedValue('instr-katie');
    mocks.findByStartInRange.mockResolvedValue([]);
    mocks.findBlocks.mockResolvedValue([]);
    mocks.findLessons.mockResolvedValue([]);
  });

  it('returns unlinked with no commitments or blocks when the caller has no instructor', async () => {
    mocks.instructorIdForUser.mockResolvedValue(undefined);
    const res = await handler({}, { uid: 'admin-uid' });
    expect(res.unlinked).toBe(true);
    expect(res.commitments).toEqual([]);
    expect(res.standing).toEqual([]);
    expect(res.blocks).toEqual([]);
    expect(mocks.findByStartInRange).not.toHaveBeenCalled();
  });

  it('returns the teacher’s serialized blocks and flags unattributed lessons', async () => {
    const block = {
      id: 'blk-1',
      teacherId: 'instr-katie',
      dayOfWeek: 2,
      startMinutes: 900,
      endMinutes: 1080,
      label: 'Tue',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mocks.findBlocks.mockResolvedValue([block]);
    // A lesson with no blockId -> unattributed.
    mocks.findLessons.mockResolvedValue([
      {
        id: 'les-x',
        teacherId: 'instr-katie',
        scheduledAt: new Date('2026-07-21T20:00:00Z'),
        durationMinutes: 30,
        blockId: null,
      },
    ]);
    mocks.findByStartInRange.mockResolvedValue([
      {
        id: 'lesson-les-x',
        title: 'Music Lesson',
        type: 'lesson',
        startDateTime: new Date('2026-07-21T20:00:00Z'),
        endDateTime: new Date('2026-07-21T20:30:00Z'),
        room: 'spruce',
        sourceRef: 'lessons/les-x',
        ownerInstructorId: 'instr-katie',
      },
    ]);

    const res = await handler(
      { from: '2026-07-19T00:00:00', to: '2026-07-26T00:00:00' },
      { uid: 'katie-uid' },
    );
    expect(res.blocks).toEqual([
      {
        id: 'blk-1',
        teacherId: 'instr-katie',
        dayOfWeek: 2,
        startMinutes: 900,
        endMinutes: 1080,
        label: 'Tue',
      },
    ]);
    expect(res.commitments[0].unattributed).toBe(true);
  });

  it('queries a lookback window ending at the week end', async () => {
    await handler(
      { from: '2026-07-19T00:00:00', to: '2026-07-26T00:00:00' },
      { uid: 'katie-uid' },
    );
    const [fromArg, toArg] = mocks.findByStartInRange.mock.calls[0];
    const from = new Date('2026-07-19T00:00:00');
    const to = new Date('2026-07-26T00:00:00');
    expect(toArg.getTime()).toBe(to.getTime());
    // lookback = from - 28 days
    expect(fromArg.getTime()).toBe(from.getTime() - 28 * 24 * 60 * 60 * 1000);
  });
});
