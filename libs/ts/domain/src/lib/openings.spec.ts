import { describe, it, expect } from 'vitest';
import {
  computeOpenings,
  LESSON_DURATIONS_MINUTES,
  type OccupiedInterval,
} from './openings';

/** Tue 3:00–6:00 PM block (minutes-from-midnight: 900–1080). */
const tueBlock = {
  id: 'blk-tue',
  dayOfWeek: 2,
  startMinutes: 15 * 60,
  endMinutes: 18 * 60,
};

describe('computeOpenings', () => {
  it('an empty block is one opening spanning the whole window', () => {
    const openings = computeOpenings([tueBlock], []);
    expect(openings).toEqual([
      {
        blockId: 'blk-tue',
        weekday: 2,
        startMinutes: 900,
        endMinutes: 1080,
        fitsDurations: [60, 45, 30],
      },
    ]);
  });

  it('a fully-booked block yields no openings', () => {
    const occupied: OccupiedInterval[] = [
      { weekday: 2, startMinutes: 900, endMinutes: 1080 },
    ];
    expect(computeOpenings([tueBlock], occupied)).toEqual([]);
  });

  it('a lesson in the middle splits the block into two openings', () => {
    // Lesson 4:00–4:30 PM (960–990).
    const occupied: OccupiedInterval[] = [
      { weekday: 2, startMinutes: 960, endMinutes: 990 },
    ];
    const openings = computeOpenings([tueBlock], occupied);
    expect(openings).toEqual([
      {
        blockId: 'blk-tue',
        weekday: 2,
        startMinutes: 900,
        endMinutes: 960,
        fitsDurations: [60, 45, 30],
      },
      {
        blockId: 'blk-tue',
        weekday: 2,
        startMinutes: 990,
        endMinutes: 1080,
        fitsDurations: [60, 45, 30],
      },
    ]);
  });

  it('drops a gap shorter than the minimum bookable lesson', () => {
    // Two lessons leaving only a 15-min gap (945–960) between them.
    const occupied: OccupiedInterval[] = [
      { weekday: 2, startMinutes: 900, endMinutes: 945 },
      { weekday: 2, startMinutes: 960, endMinutes: 1080 },
    ];
    // The 15-min gap is dropped; nothing else is free.
    expect(computeOpenings([tueBlock], occupied)).toEqual([]);
  });

  it('labels each gap with the durations that fit it', () => {
    // Free 3:00–3:45 (45 min) then a lesson, then free 4:15–4:45 (30 min).
    const occupied: OccupiedInterval[] = [
      { weekday: 2, startMinutes: 945, endMinutes: 975 }, // 3:45–4:15
      { weekday: 2, startMinutes: 1005, endMinutes: 1080 }, // 4:45–6:00
    ];
    const openings = computeOpenings([tueBlock], occupied);
    expect(openings.map((o) => o.fitsDurations)).toEqual([
      [45, 30], // 45-min gap
      [30], // 30-min gap
    ]);
  });

  it('ignores occupied intervals on other weekdays', () => {
    const occupied: OccupiedInterval[] = [
      { weekday: 3, startMinutes: 900, endMinutes: 1080 }, // Wednesday — not Tuesday
    ];
    const openings = computeOpenings([tueBlock], occupied);
    expect(openings).toHaveLength(1);
    expect(openings[0].startMinutes).toBe(900);
  });

  it('clamps occupied intervals that spill outside the block window', () => {
    // A lesson 2:30–3:30 PM (870–990) partially before the block; only
    // 3:00–3:30 is inside, so the opening starts at 3:30.
    const occupied: OccupiedInterval[] = [
      { weekday: 2, startMinutes: 870, endMinutes: 990 },
    ];
    const openings = computeOpenings([tueBlock], occupied);
    expect(openings).toEqual([
      {
        blockId: 'blk-tue',
        weekday: 2,
        startMinutes: 990,
        endMinutes: 1080,
        fitsDurations: [60, 45, 30],
      },
    ]);
  });

  it('merges overlapping and touching occupied intervals', () => {
    // 3:00–4:00 and 3:30–4:30 overlap → busy 3:00–4:30; 4:30 touches 4:30–5:00.
    const occupied: OccupiedInterval[] = [
      { weekday: 2, startMinutes: 900, endMinutes: 960 },
      { weekday: 2, startMinutes: 930, endMinutes: 990 },
      { weekday: 2, startMinutes: 990, endMinutes: 1020 },
    ];
    const openings = computeOpenings([tueBlock], occupied);
    // Free only 5:00–6:00 PM.
    expect(openings).toEqual([
      {
        blockId: 'blk-tue',
        weekday: 2,
        startMinutes: 1020,
        endMinutes: 1080,
        fitsDurations: [60, 45, 30],
      },
    ]);
  });

  it('handles multiple blocks and sorts by weekday then start', () => {
    const thuBlock = {
      id: 'blk-thu',
      dayOfWeek: 4,
      startMinutes: 10 * 60,
      endMinutes: 12 * 60,
    };
    const openings = computeOpenings([thuBlock, tueBlock], []);
    expect(openings.map((o) => [o.weekday, o.startMinutes])).toEqual([
      [2, 900],
      [4, 600],
    ]);
  });

  it('respects a custom minimum-opening length', () => {
    // A 30-min gap is dropped when the minimum is raised to 45.
    const occupied: OccupiedInterval[] = [
      { weekday: 2, startMinutes: 930, endMinutes: 1080 },
    ];
    expect(computeOpenings([tueBlock], occupied, 45)).toEqual([]);
    // …but kept at the default 30.
    expect(computeOpenings([tueBlock], occupied)).toHaveLength(1);
  });

  it('exposes durations longest-first', () => {
    expect([...LESSON_DURATIONS_MINUTES]).toEqual([60, 45, 30]);
  });
});
