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
  dateTime: futureDate(),
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
  dateTime: futureDate(),
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
  dateTime: futureDate(),
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
  dateTime: pastDate(),
  durationMinutes: 120,
  capacity: 10,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'published',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Well-known doc IDs for test classes */
export const CLASS_IDS = {
  published: 'test-class-published',
  draft: 'test-class-draft',
  cancelled: 'test-class-cancelled',
  past: 'test-class-past',
} as const;
