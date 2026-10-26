/**
 * Class fixtures for integration tests.
 *
 * These are written directly to Firestore via the emulator REST API,
 * so they use raw field values (not the domain Class type).
 */

/** A future date, 30 days from now */
function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

/** A past date, 7 days ago */
function pastDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export const PUBLISHED_CLASS = {
  name: 'Intro to Pottery',
  description: 'Learn the basics of wheel throwing.',
  sessions: [{ dateTime: futureDate() }],
  firstSessionAt: futureDate(),
  durationMinutes: 120,
  capacity: 10,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'published',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const DRAFT_CLASS = {
  name: 'Advanced Glazing',
  description: 'Advanced glazing techniques.',
  sessions: [{ dateTime: futureDate() }],
  firstSessionAt: futureDate(),
  durationMinutes: 90,
  capacity: 8,
  priceCents: 6000,
  skillLevel: 'advanced',
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const CANCELLED_CLASS = {
  name: 'Cancelled Workshop',
  description: 'This class was cancelled.',
  sessions: [{ dateTime: futureDate() }],
  firstSessionAt: futureDate(),
  durationMinutes: 60,
  capacity: 12,
  priceCents: 3500,
  skillLevel: 'all-levels',
  status: 'cancelled',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const PAST_CLASS = {
  name: 'Past Pottery Session',
  description: 'This class already happened.',
  sessions: [{ dateTime: pastDate() }],
  firstSessionAt: pastDate(),
  durationMinutes: 120,
  capacity: 10,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'published',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Published class with instructor and category references */
export const PUBLISHED_CLASS_WITH_REFS = {
  ...PUBLISHED_CLASS,
  name: 'Published Class With Refs',
  instructorId: 'test-instructor-1',
  categoryId: 'test-category-1',
};

/** Published class without an instructor (for graceful-handling tests) */
export const PUBLISHED_CLASS_NO_INSTRUCTOR = {
  ...PUBLISHED_CLASS,
  name: 'Published Class No Instructor',
};

/** Sample instructor fixture for enrichment tests */
export const SAMPLE_INSTRUCTOR = {
  name: 'Jane Weaver',
  email: 'jane@test.com',
  status: 'active',
  bio: 'Fiber artist with 15 years of experience in natural dyeing and weaving.',
  specialties: ['weaving', 'natural dyeing'],
  payRateType: 'flat',
  payRate: 7500,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Sample class category fixture for enrichment tests */
export const SAMPLE_CLASS_CATEGORY = {
  name: 'Pottery',
  description: 'Pottery and ceramics classes.',
  slug: 'pottery',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Well-known doc IDs for test classes */
export const CLASS_IDS = {
  published: 'test-class-published',
  draft: 'test-class-draft',
  cancelled: 'test-class-cancelled',
  past: 'test-class-past',
  syncTriggerCreate: 'test-sync-trigger-create',
  syncTriggerDraft: 'test-sync-trigger-draft',
  syncTriggerUnpublish: 'test-sync-trigger-unpublish',
  syncTriggerDelete: 'test-sync-trigger-delete',
  publishedWithRefs: 'test-class-published-with-refs',
  publishedNoInstructor: 'test-class-published-no-instructor',
} as const;

/**
 * Bookable hours of the private-hours fixture: two days, 10 and 17 days out,
 * each with three hours at 15:00, 16:30 and 18:00 UTC. Fixed to the top of
 * the hour so hour labels are stable; recomputed per process so they stay
 * in the future.
 */
export function privateHourStarts(now: Date = new Date()): Date[] {
  const starts: Date[] = [];
  for (const daysOut of [10, 17]) {
    for (const [h, m] of [
      [15, 0],
      [16, 30],
      [18, 0],
    ]) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + daysOut);
      d.setUTCHours(h, m, 0, 0);
      starts.push(d);
    }
  }
  return starts;
}

/**
 * A published private-hours class: each session is one hour a single group
 * books, at $60 per group, largest group 12. Dates are real `Date`s so both
 * the emulator REST writer and the Admin SDK store Firestore Timestamps.
 */
export function privateHoursClass(starts: Date[] = privateHourStarts()) {
  return {
    name: 'E2E Ornament Party',
    description: 'A private hour for your group to decorate ornaments.',
    format: 'privateHours',
    sessions: starts.map((dateTime) => ({ dateTime })),
    firstSessionAt: starts[0],
    durationMinutes: 60,
    capacity: 12,
    priceCents: 6000,
    skillLevel: 'all-levels',
    status: 'published',
    room: 'spruce',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * A confirmed booking holding one hour of a private-hours class, so a spec
 * can see that hour as booked. Invented person.
 */
export function privateHourBooking(classId: string, slotStart: Date) {
  return {
    classId,
    customerEmail: 'held-hour@maplespruce.test',
    customerName: 'Held Hour Host',
    quantity: 1,
    slotStart,
    groupSize: 6,
    pricePaidCents: 6360,
    subtotalCents: 6000,
    taxAmountCents: 360,
    taxRatePercent: 6,
    status: 'confirmed',
    source: 'web',
    confirmationNumber: 'MS-E2EHLD',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
