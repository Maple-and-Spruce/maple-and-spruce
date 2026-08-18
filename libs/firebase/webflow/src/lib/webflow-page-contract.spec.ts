/**
 * Contract tests: the Webflow field slugs the live pages actually bind to.
 *
 * The class template page renders the sold-out "Other upcoming dates" list
 * natively from the CMS (#776) — no Cloud Function is involved any more. That
 * makes a handful of field slugs a **published contract** between this sync and
 * the Designer: rename or drop one here and the live section silently stops
 * working, with green unit tests and no error anywhere.
 *
 * The rest of `class.service.spec.ts` tests how each value is *computed*. This
 * file tests only that the agreed slugs are *present and correctly typed*, so
 * the failure message points at the page that breaks rather than at a mapper
 * detail.
 *
 * Page: "Classes" template (`detail_classes`, page 69d0fb7572d9e153c22ce48f) on
 * site 691a5d6c07ba1bf4714e826f. If you intentionally change a slug, update the
 * Designer binding in the same PR and republish — the two have to move together.
 */
import { describe, it, expect } from 'vitest';
import { mapClassToFieldData } from './class.service';
import { mapClassCategoryToFieldData } from './class-category.service';
import type { PublishableClass, ClassSession } from '@maple/ts/domain';
import type { ClassCategory } from '@maple/ts/domain';

const baseClass: PublishableClass = {
  id: 'class-contract-1',
  name: 'Stained Glass - TryIt Class',
  description: 'Make your own suncatcher.',
  sessions: [
    { dateTime: new Date('2026-09-11T22:00:00.000Z') },
  ] satisfies [ClassSession, ...ClassSession[]],
  durationMinutes: 180,
  capacity: 8,
  priceCents: 6000,
  skillLevel: 'beginner',
  status: 'published',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mapOptions = {
  isDev: false,
  categoryName: 'Stain Glass TryIt',
  categoryWebflowItemId: 'wf-cat-1',
};

/**
 * Every slug the related-classes Collection List depends on, and what it is
 * wired to in the Designer. Keep the comments accurate — they are the only
 * record of which page control each field feeds.
 */
const CLASS_PAGE_CONTRACT: {
  slug: string;
  type: 'string' | 'number' | 'boolean';
  usedFor: string;
}[] = [
  {
    slug: 'is-full',
    type: 'boolean',
    usedFor:
      "visibility binding on the 'Related Classes (sold out)' block — Webflow conditional visibility is not API-authorable, so this switch is the condition",
  },
  {
    slug: 'category-name',
    type: 'string',
    usedFor:
      "Collection List filter: category-name equals the current item's category-name (an itemRef filter cannot take a bound value, so this plain-text field carries the match)",
  },
  {
    slug: 'firebase-id',
    type: 'string',
    usedFor:
      "Collection List filter: firebase-id doesNotEqual the current item's firebase-id — this is what excludes the class from its own related list",
  },
  {
    slug: 'spots-remaining',
    type: 'number',
    usedFor: 'Collection List filter: spots-remaining greater than 0',
  },
  {
    slug: 'date-time',
    type: 'string',
    usedFor:
      'Collection List filter (future only) and sort (ascending, soonest first)',
  },
  {
    slug: 'is-dev-environment',
    type: 'boolean',
    usedFor:
      'Collection List filter: isOff — keeps dev-synced items off the shared production site',
  },
  { slug: 'name', type: 'string', usedFor: 'related-card title text binding' },
  {
    slug: 'date-display',
    type: 'string',
    usedFor: 'related-card date text binding',
  },
  {
    slug: 'spots-display',
    type: 'string',
    usedFor: 'related-card spots text binding',
  },
];

describe('class template page field contract', () => {
  it.each(CLASS_PAGE_CONTRACT)(
    'sends `$slug` as a $type ($usedFor)',
    ({ slug, type }) => {
      const fieldData = mapClassToFieldData(baseClass, mapOptions);

      expect(
        fieldData[slug],
        `Webflow field "${slug}" is missing. The class template page binds to it; ` +
          `dropping it silently breaks the live page.`
      ).toBeDefined();
      expect(typeof fieldData[slug]).toBe(type);
    }
  );

  it('keeps is-full and spots-display telling the same story', () => {
    // These two are read side by side: spots-display is the badge on the card,
    // is-full decides whether the sold-out block renders at all. If they ever
    // disagree, a visitor sees "Waitlist Available" with no alternatives, or a
    // bookable class advertising other dates.
    const full = mapClassToFieldData(baseClass, {
      ...mapOptions,
      registrationCount: 8,
    });
    expect(full['is-full']).toBe(true);
    expect(full['spots-display']).toBe('Waitlist Available');

    const bookable = mapClassToFieldData(baseClass, {
      ...mapOptions,
      registrationCount: 7,
    });
    expect(bookable['is-full']).toBe(false);
    expect(bookable['spots-display']).toBe('1 spot remaining');
  });

  it('sends spots-remaining as a number the > 0 filter can compare', () => {
    // Webflow compares number filters numerically; a stringified count would
    // make every class match "greater than 0", including full ones.
    const fieldData = mapClassToFieldData(baseClass, {
      ...mapOptions,
      registrationCount: 8,
    });
    expect(fieldData['spots-remaining']).toBe(0);
    expect(typeof fieldData['spots-remaining']).toBe('number');
  });

  it('sends date-time as an ISO string Webflow can parse as a date', () => {
    const fieldData = mapClassToFieldData(baseClass, mapOptions);
    const raw = fieldData['date-time'] as string;
    expect(raw).toBe('2026-09-11T22:00:00.000Z');
    expect(Number.isNaN(Date.parse(raw))).toBe(false);
  });

  it('links the category reference by Webflow item id, not by name', () => {
    // The `category` Reference field is not what the filter runs on today, but
    // it is the switchover target that survives a category rename. A name here
    // would be silently dropped by Webflow as an invalid item id.
    const fieldData = mapClassToFieldData(baseClass, mapOptions);
    expect(fieldData['category']).toBe('wf-cat-1');
    expect(fieldData['category']).not.toBe(mapOptions.categoryName);
  });
});

describe('class categories collection field contract', () => {
  const category: ClassCategory = {
    id: 'cat-contract-1',
    name: 'Stain Glass TryIt',
    order: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it.each([
    ['firebase-id', 'string'],
    ['name', 'string'],
    ['slug', 'string'],
    ['is-dev-environment', 'boolean'],
  ] as const)('sends `%s` as a %s', (slug, type) => {
    const fieldData = mapClassCategoryToFieldData(category, { isDev: false });
    expect(fieldData[slug]).toBeDefined();
    expect(typeof fieldData[slug]).toBe(type);
  });

  it('keeps firebase-id as the lookup key the sync scans on', () => {
    // Both the sync's by-firebase-id scan and the backfill tool match on this
    // field. Losing it would orphan every existing category item and cause the
    // sync to create duplicates.
    const fieldData = mapClassCategoryToFieldData(category, { isDev: false });
    expect(fieldData['firebase-id']).toBe('cat-contract-1');
  });
});
