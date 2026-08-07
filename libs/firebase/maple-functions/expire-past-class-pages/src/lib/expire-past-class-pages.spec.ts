import { describe, it, expect, vi } from 'vitest';
import type { Class, ClassSession } from '@maple/ts/domain';

// onSchedule pulls in the functions runtime at import time; stub it so the
// pure selection helpers can be imported without a Firebase environment.
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: vi.fn(() => vi.fn()),
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => 'secret' })),
  defineString: vi.fn((name: string) => ({ name, value: () => 'string' })),
}));

import { findExpiredLiveClasses, isClassPast } from './expire-past-class-pages';

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

describe('findExpiredLiveClasses', () => {
  const pastClass = makeClass({
    id: 'past-1',
    name: 'Stained Glass - TryIt Class',
    sessions: [{ dateTime: new Date('2026-07-30T22:00:00.000Z') }],
  });
  const upcomingClass = makeClass({
    id: 'upcoming-1',
    name: 'Stained Glass - Pumpkins!',
    sessions: [{ dateTime: new Date('2026-09-03T22:00:00.000Z') }],
  });

  it('returns past classes that are currently live', () => {
    const live = new Map([
      ['past-1', 'wf-past-1'],
      ['upcoming-1', 'wf-upcoming-1'],
    ]);

    const result = findExpiredLiveClasses(
      [pastClass, upcomingClass],
      live,
      NOW
    );

    expect(result).toEqual([
      {
        classId: 'past-1',
        name: 'Stained Glass - TryIt Class',
        webflowItemId: 'wf-past-1',
      },
    ]);
  });

  it('skips past classes that are not live (idempotent re-run)', () => {
    // Second run of the day: the item is already unpublished, so Webflow no
    // longer reports it as live and there is nothing to do.
    const live = new Map([['upcoming-1', 'wf-upcoming-1']]);

    expect(findExpiredLiveClasses([pastClass, upcomingClass], live, NOW)).toEqual(
      []
    );
  });

  it('never returns an upcoming class', () => {
    const live = new Map([['upcoming-1', 'wf-upcoming-1']]);

    expect(findExpiredLiveClasses([upcomingClass], live, NOW)).toEqual([]);
  });

  it('returns nothing when no classes are live', () => {
    expect(findExpiredLiveClasses([pastClass], new Map(), NOW)).toEqual([]);
  });

  it('handles an empty class list', () => {
    expect(
      findExpiredLiveClasses([], new Map([['x', 'wf-x']]), NOW)
    ).toEqual([]);
  });
});
