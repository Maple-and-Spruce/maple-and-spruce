import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildNextLessons } from '@maple/ts/domain';
import type { Lesson, StudentLessonSchedule } from '@maple/ts/domain';
import {
  HOPE_BOOKING_STUDENT_ID,
  seedStudentManagement,
  studioTime,
} from './student-management-seed';

type Doc = Record<string, unknown>;
const docs = vi.hoisted(() => new Map<string, Map<string, Doc>>());

// Hoisted above the imports, so the seed writes into `docs`.
vi.mock('@maple/firebase/integration-test-utils', () => ({
  setFirestoreDoc: async (collection: string, id: string, data: Doc) => {
    if (!docs.has(collection)) docs.set(collection, new Map());
    docs.get(collection)?.set(id, data);
  },
  listFirestoreDocs: async (collection: string) =>
    [...(docs.get(collection) ?? new Map()).entries()].map(([id, data]) => ({
      id,
      data,
    })),
  deleteFirestoreDoc: async (collection: string, id: string) => {
    docs.get(collection)?.delete(id);
  },
}));


const MINUTE = 60_000;

/**
 * What "Book 4 lessons" would ask the server for, at `now`, and every other
 * seeded lesson it would have to fit around. Every seeded lesson names no
 * room, so all of them are in Spruce, like the Hope student's weekly time.
 */
async function hopeBookingAgainstOthers(now: Date) {
  docs.clear();
  await seedStudentManagement(now);
  const schedule = docs
    .get('studentLessonSchedules')
    ?.get('e2e-sched-hope-booking') as unknown as StudentLessonSchedule;
  const { items } = buildNextLessons({
    schedule,
    lessons: [],
    charges: [],
    invoicedIds: new Set(),
    now,
  });
  const others = [...(docs.get('lessons') ?? new Map()).values()].filter(
    (lesson) => lesson['studentId'] !== HOPE_BOOKING_STUDENT_ID
  ) as unknown as Lesson[];
  return { items, others };
}

async function findClashes(now: Date): Promise<string[]> {
  const { items, others } = await hopeBookingAgainstOthers(now);
  expect(items).toHaveLength(4);
  const found: string[] = [];
  for (const item of items) {
    const start = item.scheduledAt.getTime();
    const end = start + item.durationMinutes * MINUTE;
    for (const other of others) {
      const otherStart = other.scheduledAt.getTime();
      const otherEnd = otherStart + other.durationMinutes * MINUTE;
      if (start < otherEnd && otherStart < end) {
        found.push(`${item.scheduledAt.toISOString()} vs ${other.scheduledAt.toISOString()}`);
      }
    }
  }
  return found;
}

describe('student management seed: the Hope student can always book four', () => {
  beforeEach(() => docs.clear());

  // The CI runs that failed: Sunday afternoon Eastern, when the two-ahead
  // student's lessons sat at the run's own clock time, on the Hope slot.
  it.each(['2026-11-08T20:50:00Z', '2026-11-08T21:09:04Z'])(
    'at %s',
    async (iso) => {
      expect(await findClashes(new Date(iso))).toEqual([]);
    }
  );

  // Every quarter hour of a week, across both clock changes.
  it.each(['2026-10-28T00:00:00Z', '2027-03-10T00:00:00Z'])(
    'every 15 minutes of the week from %s',
    async (iso) => {
      const start = new Date(iso).getTime();
      for (let t = start; t < start + 7 * 24 * 60 * MINUTE; t += 15 * MINUTE) {
        const found = await findClashes(new Date(t));
        expect(found, new Date(t).toISOString()).toEqual([]);
      }
    }
  );
});

describe('studioTime', () => {
  it('keeps the wall-clock time across the fall-back', () => {
    // Saturday Oct 31 2026, 8 PM Eastern (EDT); a week on is EST.
    const now = new Date('2026-11-01T00:00:00Z');
    expect(studioTime(now, 7, 16 * 60).toISOString()).toBe(
      '2026-11-07T21:00:00.000Z'
    );
    expect(studioTime(now, 0, 16 * 60).toISOString()).toBe(
      '2026-10-31T20:00:00.000Z'
    );
  });

  it('counts days from the studio date, not the UTC one', () => {
    // 9 PM Eastern on Sunday Nov 8 is already Monday in UTC.
    const now = new Date('2026-11-09T02:00:00Z');
    expect(studioTime(now, 1, 16 * 60).toISOString()).toBe(
      '2026-11-09T21:00:00.000Z'
    );
  });
});
