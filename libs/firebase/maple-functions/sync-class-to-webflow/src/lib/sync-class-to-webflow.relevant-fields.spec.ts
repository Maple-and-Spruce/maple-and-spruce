import { describe, it, expect, vi } from 'vitest';
import type { Class, PublishableClass } from '@maple/ts/domain';

/**
 * Guard: every field the Webflow mapper reads is a field that triggers a sync.
 *
 * `isWebflowRelevantChange` short-circuits the trigger unless one of
 * `WEBFLOW_RELEVANT_FIELDS` changed. A field added to `mapClassToFieldData`
 * but not to that list is written correctly on the next unrelated edit, so it
 * looks fine in every test, yet editing only that field never reaches the site.
 * `isFeatured` shipped this way: the admin switch saved, and nothing changed on
 * /upcoming-classes.
 *
 * This runs the real mapper against one change per Class field. The table is
 * typed as every key of `Class`, so a new field fails typecheck until it is
 * listed here, and then fails this test if it reaches Webflow without
 * triggering a sync.
 */

vi.mock('@maple/firebase/sync-alerts', () => ({ reportSyncFailure: vi.fn() }));
vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {},
  InstructorRepository: {},
  ClassCategoryRepository: {},
  RegistrationRepository: {},
}));
vi.mock('@maple/firebase/functions', () => ({
  FirebaseProject: { isDev: false },
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => '' })),
  defineString: vi.fn((name: string) => ({ name, value: () => '' })),
}));

import { mapClassToFieldData } from '@maple/firebase/webflow';
import { isWebflowRelevantChange } from './sync-class-to-webflow';

const base: PublishableClass = {
  id: 'class-1',
  name: 'Test Class',
  description: 'A description.',
  shortDescription: 'Short.',
  instructorId: 'instructor-1',
  sessions: [{ dateTime: new Date('2030-01-10T18:00:00.000Z') }],
  durationMinutes: 120,
  registrationClosesAt: new Date('2030-01-09T18:00:00.000Z'),
  capacity: 8,
  priceCents: 6000,
  imageUrl: 'https://example.com/a.jpg',
  galleryImages: [{ url: 'https://example.com/g.jpg', alt: 'g' }],
  categoryId: 'cat-1',
  skillLevel: 'beginner',
  status: 'published',
  location: 'Studio',
  room: null,
  materialsIncluded: 'Glass',
  whatToBring: 'Shoes',
  minimumAge: 12,
  minimumEnrollment: 3,
  underMinimumAlertSentAt: undefined,
  isFeatured: false,
  webflowItemId: 'wf-1',
  webflowSlug: 'test-class',
  squareCatalogItemId: 'sq-1',
  squareVariationId: 'sqv-1',
  squareModifierListId: 'sqm-1',
  squareCatalogVersion: 1,
  referralDiscount: undefined,
  createdAt: new Date('2029-12-01T00:00:00.000Z'),
  updatedAt: new Date('2029-12-01T00:00:00.000Z'),
};

/** One changed value for every field of `Class`. */
const CHANGED: { [K in keyof Class]-?: Class[K] } = {
  id: 'class-2',
  name: 'Renamed Class',
  description: 'Another description.',
  shortDescription: 'Other.',
  instructorId: 'instructor-2',
  sessions: [{ dateTime: new Date('2030-02-10T18:00:00.000Z') }],
  format: 'privateHours',
  durationMinutes: 90,
  registrationClosesAt: new Date('2030-02-09T18:00:00.000Z'),
  capacity: 10,
  priceCents: 4500,
  imageUrl: 'https://example.com/b.jpg',
  galleryImages: [{ url: 'https://example.com/h.jpg', alt: 'h' }],
  categoryId: 'cat-2',
  skillLevel: 'intermediate',
  status: 'draft',
  location: 'Elsewhere',
  room: 'spruce',
  materialsIncluded: 'Copper',
  whatToBring: 'Apron',
  minimumAge: 16,
  minimumEnrollment: 4,
  underMinimumAlertSentAt: new Date('2030-01-03T12:00:00.000Z'),
  isFeatured: true,
  webflowItemId: 'wf-2',
  webflowSlug: 'renamed-class',
  squareCatalogItemId: 'sq-2',
  squareVariationId: 'sqv-2',
  squareModifierListId: 'sqm-2',
  squareCatalogVersion: 2,
  referralDiscount: { percent: 50, expiresAfterDays: 60 },
  createdAt: new Date('2029-12-02T00:00:00.000Z'),
  updatedAt: new Date('2029-12-02T00:00:00.000Z'),
};

/** Never edited after create, so a change to it never needs to trigger a sync. */
const IMMUTABLE: ReadonlyArray<keyof Class> = ['id'];

const fields = (Object.keys(CHANGED) as (keyof Class)[]).filter(
  (field) => !IMMUTABLE.includes(field)
);

describe('WEBFLOW_RELEVANT_FIELDS covers what the Webflow mapper reads', () => {
  const options = { isDev: false };
  const baseFieldData = JSON.stringify(mapClassToFieldData(base, options));

  it.each(fields)('a change to `%s` that reaches Webflow triggers a sync', (field) => {
    const after = { ...base, [field]: CHANGED[field] } as PublishableClass;
    const reachesWebflow =
      JSON.stringify(mapClassToFieldData(after, options)) !== baseFieldData;

    if (reachesWebflow) {
      expect(
        isWebflowRelevantChange(base, after),
        `mapClassToFieldData reads "${field}", but it is not in WEBFLOW_RELEVANT_FIELDS, ` +
          `so editing only "${field}" never reaches Webflow.`
      ).toBe(true);
    }
  });

  it('treats a featured toggle as a Webflow change', () => {
    expect(isWebflowRelevantChange(base, { ...base, isFeatured: true })).toBe(true);
  });
});
