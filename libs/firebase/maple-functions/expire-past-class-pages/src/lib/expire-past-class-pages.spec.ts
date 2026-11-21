import { describe, it, expect } from 'vitest';
import type { Class, ClassSession } from '@maple/ts/domain';

// Imports the barrel-free logic module ONLY. Importing the onSchedule wiring
// module instead would pull @maple/firebase/{webflow,database,functions} into
// the coverage report (~124 files at ~5%) and sink the global threshold.
import {
  findPastClassesToRestore,
  isClassPast,
} from './expire-past-class-pages.logic';

const NOW = new Date('2026-08-07T12:00:00.000Z');

function makeClass(overrides: Partial<Class> & { id: string }): Class {
  return {
    name: 'Stained Glass - TryIt Class',
    description: 'desc',
    sessions: [] as ClassSession[],
    durationMinutes: 120,
    capacity: 8,
    priceCents: 4000,
    skillLevel: 'beginner',
    status: 'published',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Class;
}

describe('isClassPast', () => {
  it('is past when the only session ended before now', () => {
    const classEntity = makeClass({
      id: 'c1',
      sessions: [{ dateTime: new Date('2026-08-06T22:00:00.000Z') }],
      durationMinutes: 90,
    });

    expect(isClassPast(classEntity, NOW)).toBe(true);
  });

  it('is not past when the session is still upcoming', () => {
    const classEntity = makeClass({
      id: 'c2',
      sessions: [{ dateTime: new Date('2026-08-10T22:00:00.000Z') }],
    });

    expect(isClassPast(classEntity, NOW)).toBe(false);
  });

  it('stays live until the LAST session of a multi-week series finishes', () => {
    const studioSeries = makeClass({
      id: 'c3',
      sessions: [
        { dateTime: new Date('2026-07-20T22:00:00.000Z') },
        { dateTime: new Date('2026-07-27T22:00:00.000Z') },
        { dateTime: new Date('2026-08-24T22:00:00.000Z') }, // future
      ],
    });

    expect(isClassPast(studioSeries, NOW)).toBe(false);
  });

  it('uses session end, not start, so a class mid-session stays live', () => {
    // Starts 1 hour ago, runs 2 hours -> still in progress.
    const inProgress = makeClass({
      id: 'c4',
      sessions: [{ dateTime: new Date('2026-08-07T11:00:00.000Z') }],
      durationMinutes: 120,
    });

    expect(isClassPast(inProgress, NOW)).toBe(false);
  });

  it('treats sessionless draft classes as not past', () => {
    expect(isClassPast(makeClass({ id: 'c5', sessions: [] }), NOW)).toBe(false);
  });

  it('handles a Firestore Timestamp-shaped dateTime', () => {
    // Firestore hands back Timestamps, not Dates, on some read paths.
    const ts = { toDate: () => new Date('2026-07-30T22:00:00.000Z') };
    const classEntity = makeClass({
      id: 'ts-1',
      sessions: [{ dateTime: ts } as unknown as ClassSession],
    });

    expect(isClassPast(classEntity, NOW)).toBe(true);
  });

  it('handles an ISO-string dateTime', () => {
    const classEntity = makeClass({
      id: 'str-1',
      sessions: [
        { dateTime: '2026-09-03T22:00:00.000Z' } as unknown as ClassSession,
      ],
    });

    expect(isClassPast(classEntity, NOW)).toBe(false);
  });

  it('reads an unparseable dateTime as long past', () => {
    // Garbage normalizes to epoch 0. That is harmless now: being past only
    // ever puts a page back online, it never takes one down.
    const classEntity = makeClass({
      id: 'bad-1',
      sessions: [{ dateTime: 'not-a-date' } as unknown as ClassSession],
    });

    expect(isClassPast(classEntity, NOW)).toBe(true);
  });

  it('sorts unordered sessions before picking the last one', () => {
    const unordered = makeClass({
      id: 'c6',
      sessions: [
        { dateTime: new Date('2026-08-24T22:00:00.000Z') }, // future, listed first
        { dateTime: new Date('2026-07-20T22:00:00.000Z') },
      ],
    });

    expect(isClassPast(unordered, NOW)).toBe(false);
  });
});

describe('findPastClassesToRestore', () => {
  const pastClass = makeClass({
    id: 'past-1',
    name: 'Stained Glass - TryIt Class',
    webflowItemId: 'wf-past-1',
    sessions: [{ dateTime: new Date('2026-07-30T22:00:00.000Z') }],
  });
  const upcomingClass = makeClass({
    id: 'upcoming-1',
    name: 'Stained Glass - Pumpkins!',
    webflowItemId: 'wf-upcoming-1',
    sessions: [{ dateTime: new Date('2026-09-03T22:00:00.000Z') }],
  });

  it('returns past published classes whose page is not live', () => {
    expect(
      findPastClassesToRestore([pastClass, upcomingClass], new Map(), NOW)
    ).toEqual([
      {
        classId: 'past-1',
        name: 'Stained Glass - TryIt Class',
        webflowItemId: 'wf-past-1',
      },
    ]);
  });

  it('skips past classes that are already live (idempotent re-run)', () => {
    const live = new Map([['past-1', 'wf-past-1']]);

    expect(findPastClassesToRestore([pastClass], live, NOW)).toEqual([]);
  });

  it('never restores an upcoming class', () => {
    expect(findPastClassesToRestore([upcomingClass], new Map(), NOW)).toEqual(
      []
    );
  });

  it.each(['draft', 'cancelled', 'completed'] as const)(
    'leaves a %s class off the site',
    (status) => {
      expect(
        findPastClassesToRestore([{ ...pastClass, status }], new Map(), NOW)
      ).toEqual([]);
    }
  );

  it('skips a class that was never synced to Webflow', () => {
    const neverSynced = { ...pastClass, webflowItemId: undefined };

    expect(findPastClassesToRestore([neverSynced], new Map(), NOW)).toEqual([]);
  });

  it('handles an empty class list', () => {
    expect(findPastClassesToRestore([], new Map(), NOW)).toEqual([]);
  });
});
