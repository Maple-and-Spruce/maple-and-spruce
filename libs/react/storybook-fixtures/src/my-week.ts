import type { GetMyWeekResponse } from '@maple/ts/firebase/api-types';

/**
 * Mock getMyWeek response for the My Week tab. The week starts Sun 2026-07-19;
 * times are ISO-UTC that map to the intended ET wall-clock (EDT = UTC-4).
 */
export const mockMyWeekResponse: GetMyWeekResponse = {
  unlinked: false,
  // The standing/typical-week pattern (recurring slots, no concrete date) —
  // mirrors the recurring commitments below (the one-off lessons drop out).
  standing: [
    {
      id: 'std-lesson-tue',
      weekday: 2, // Tuesday
      startMinutes: 15 * 60,
      durationMinutes: 30,
      category: 'lesson',
      ownership: 'mine',
      title: 'Music Lesson',
    },
    {
      id: 'std-class-thu',
      weekday: 4, // Thursday
      startMinutes: 10 * 60,
      durationMinutes: 90,
      category: 'class',
      ownership: 'mine',
      title: 'Watercolor Basics',
    },
    {
      id: 'std-jam-fri',
      weekday: 5, // Friday
      startMinutes: 18 * 60,
      durationMinutes: 120,
      category: 'jam',
      ownership: 'shared',
      title: 'Friday Jam',
    },
  ],
  blocks: [
    {
      id: 'blk-tue',
      teacherId: 'instructor-001',
      dayOfWeek: 2, // Tuesday
      startMinutes: 15 * 60, // 3:00 PM
      endMinutes: 18 * 60, // 6:00 PM
      label: 'Tue afternoons',
    },
  ],
  commitments: [
    // Two lessons inside the Tuesday block.
    {
      id: 'lesson-1',
      title: 'Music Lesson',
      category: 'lesson',
      startDateTime: '2026-07-21T19:00:00Z', // Tue 3:00 PM ET
      endDateTime: '2026-07-21T19:30:00Z',
      room: 'spruce',
      ownership: 'mine',
      cadence: 'recurring',
      unattributed: false,
    },
    {
      id: 'lesson-2',
      title: 'Music Lesson',
      category: 'lesson',
      startDateTime: '2026-07-21T19:30:00Z', // Tue 3:30 PM ET
      endDateTime: '2026-07-21T20:00:00Z',
      room: 'spruce',
      ownership: 'mine',
      cadence: 'one-off',
      unattributed: false,
    },
    // A lesson with no block on Wednesday → flagged.
    {
      id: 'lesson-3',
      title: 'Music Lesson',
      category: 'lesson',
      startDateTime: '2026-07-22T20:00:00Z', // Wed 4:00 PM ET
      endDateTime: '2026-07-22T20:30:00Z',
      room: 'spruce',
      ownership: 'mine',
      cadence: 'one-off',
      unattributed: true,
    },
    // A class the teacher teaches (Thursday).
    {
      id: 'class-1',
      title: 'Watercolor Basics',
      category: 'class',
      startDateTime: '2026-07-23T14:00:00Z', // Thu 10:00 AM ET
      endDateTime: '2026-07-23T15:30:00Z',
      room: 'spruce',
      ownership: 'mine',
      cadence: 'recurring',
      unattributed: false,
    },
    // A shared store-wide jam (Friday).
    {
      id: 'jam-1',
      title: 'Friday Jam',
      category: 'jam',
      startDateTime: '2026-07-24T22:00:00Z', // Fri 6:00 PM ET
      endDateTime: '2026-07-25T00:00:00Z',
      room: 'spruce',
      ownership: 'shared',
      cadence: 'recurring',
      unattributed: false,
    },
  ],
};

/** Week start (local Sunday) matching mockMyWeekResponse. */
export const mockMyWeekStart = new Date(2026, 6, 19);
