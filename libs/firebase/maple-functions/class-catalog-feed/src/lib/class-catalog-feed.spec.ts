import { describe, it, expect } from 'vitest';
import type { Class } from '@maple/ts/domain';
import {
  buildFeedFromClasses,
  generateClassSlug,
  mapClassToFeedItem,
} from './class-catalog-feed';

function makeClass(overrides: Partial<Class> = {}): Class {
  const now = new Date('2026-04-01T00:00:00Z');
  return {
    id: 'class-abc',
    name: 'Stained Glass Studio Series',
    description: 'A four-week studio series for stained glass.',
    sessions: [{ dateTime: new Date('2026-05-01T18:00:00Z') }],
    durationMinutes: 180,
    capacity: 8,
    priceCents: 18000,
    imageUrl: 'https://example.com/stained-glass.jpg',
    skillLevel: 'all-levels',
    status: 'published',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('generateClassSlug', () => {
  it('lowercases and hyphenates a class name', () => {
    expect(generateClassSlug('Stained Glass Studio Series')).toBe(
      'stained-glass-studio-series'
    );
  });

  it('strips leading and trailing punctuation', () => {
    expect(generateClassSlug("!!Hammered Copper!!")).toBe('hammered-copper');
  });

  it('collapses runs of non-alphanumeric characters', () => {
    expect(generateClassSlug('Try-It :: Class!')).toBe('try-it-class');
  });
});

describe('mapClassToFeedItem', () => {
  it('builds the public link from the class name slug', () => {
    const item = mapClassToFeedItem(makeClass(), 0);
    expect(item?.link).toBe(
      'https://mapleandsprucefolkarts.com/classes/stained-glass-studio-series'
    );
  });

  it('reports availability based on remaining spots', () => {
    expect(mapClassToFeedItem(makeClass({ capacity: 8 }), 5)?.available).toBe(true);
    expect(mapClassToFeedItem(makeClass({ capacity: 8 }), 8)?.available).toBe(false);
    expect(mapClassToFeedItem(makeClass({ capacity: 8 }), 99)?.available).toBe(false);
  });

  it('prefers shortDescription over description when present', () => {
    const item = mapClassToFeedItem(
      makeClass({
        shortDescription: 'Short tag',
        description: 'Long description body',
      }),
      0
    );
    expect(item?.description).toBe('Short tag');
  });

  it('falls back to description when shortDescription is missing', () => {
    const item = mapClassToFeedItem(
      makeClass({ shortDescription: undefined, description: 'Full body' }),
      0
    );
    expect(item?.description).toBe('Full body');
  });

  it('returns null when the class has no image (catalog would reject it)', () => {
    expect(mapClassToFeedItem(makeClass({ imageUrl: undefined }), 0)).toBeNull();
  });

  it('uses USD as the currency', () => {
    expect(mapClassToFeedItem(makeClass(), 0)?.currency).toBe('USD');
  });

  it('preserves the priceCents value untouched for the formatter', () => {
    expect(mapClassToFeedItem(makeClass({ priceCents: 4500 }), 0)?.priceCents).toBe(
      4500
    );
  });
});

describe('buildFeedFromClasses', () => {
  it('emits one <item> per published class with an image', () => {
    const xml = buildFeedFromClasses([
      { classEntity: makeClass({ id: 'a', name: 'Class A' }), registrationCount: 0 },
      { classEntity: makeClass({ id: 'b', name: 'Class B' }), registrationCount: 0 },
    ]);

    expect((xml.match(/<item>/g) ?? []).length).toBe(2);
    expect(xml).toContain('<g:id>a</g:id>');
    expect(xml).toContain('<g:id>b</g:id>');
  });

  it('drops classes without an image rather than failing the feed', () => {
    const xml = buildFeedFromClasses([
      { classEntity: makeClass({ id: 'a' }), registrationCount: 0 },
      {
        classEntity: makeClass({ id: 'no-image', imageUrl: undefined }),
        registrationCount: 0,
      },
    ]);

    expect(xml).toContain('<g:id>a</g:id>');
    expect(xml).not.toContain('<g:id>no-image</g:id>');
  });

  it('produces an empty-channel document when no classes are passed', () => {
    const xml = buildFeedFromClasses([]);
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
    expect(xml.trim().endsWith('</rss>')).toBe(true);
  });
});
