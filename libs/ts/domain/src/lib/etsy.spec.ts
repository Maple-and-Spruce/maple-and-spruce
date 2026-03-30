import { describe, it, expect } from 'vitest';
import { mergeEtsyTemplates } from './etsy';
import type { EtsyListingDefaults } from './etsy';

describe('mergeEtsyTemplates', () => {
  it('returns empty defaults when no templates provided', () => {
    const result = mergeEtsyTemplates(undefined, undefined);
    expect(result).toEqual({
      taxonomyId: undefined,
      tags: undefined,
      materials: undefined,
      whoMade: undefined,
      whenMade: undefined,
      isSupply: undefined,
      shippingProfileId: undefined,
      shopSectionId: undefined,
    });
  });

  it('returns category defaults when no artist template', () => {
    const category: EtsyListingDefaults = {
      taxonomyId: 123,
      tags: ['handmade', 'pottery'],
      materials: ['clay'],
      whoMade: 'someone_else',
      whenMade: '2020_2025',
      isSupply: false,
      shippingProfileId: 456,
    };

    const result = mergeEtsyTemplates(category, undefined);
    expect(result.taxonomyId).toBe(123);
    expect(result.tags).toEqual(['handmade', 'pottery']);
    expect(result.materials).toEqual(['clay']);
    expect(result.whoMade).toBe('someone_else');
    expect(result.shippingProfileId).toBe(456);
  });

  it('returns artist defaults when no category template', () => {
    const artist: EtsyListingDefaults = {
      whoMade: 'i_did',
      tags: ['local-artist'],
    };

    const result = mergeEtsyTemplates(undefined, artist);
    expect(result.whoMade).toBe('i_did');
    expect(result.tags).toEqual(['local-artist']);
  });

  it('artist scalar fields override category fields', () => {
    const category: EtsyListingDefaults = {
      taxonomyId: 100,
      whoMade: 'someone_else',
      shippingProfileId: 1,
    };
    const artist: EtsyListingDefaults = {
      whoMade: 'i_did',
      shippingProfileId: 2,
    };

    const result = mergeEtsyTemplates(category, artist);
    expect(result.taxonomyId).toBe(100); // category, no artist override
    expect(result.whoMade).toBe('i_did'); // artist override
    expect(result.shippingProfileId).toBe(2); // artist override
  });

  it('tags are additive (category + artist), deduplicated', () => {
    const category: EtsyListingDefaults = {
      tags: ['handmade', 'pottery', 'folk-art'],
    };
    const artist: EtsyListingDefaults = {
      tags: ['pottery', 'local-artist', 'wv-made'],
    };

    const result = mergeEtsyTemplates(category, artist);
    expect(result.tags).toEqual([
      'handmade',
      'pottery',
      'folk-art',
      'local-artist',
      'wv-made',
    ]);
  });

  it('tags are capped at 13', () => {
    const category: EtsyListingDefaults = {
      tags: Array.from({ length: 10 }, (_, i) => `cat-tag-${i}`),
    };
    const artist: EtsyListingDefaults = {
      tags: Array.from({ length: 10 }, (_, i) => `art-tag-${i}`),
    };

    const result = mergeEtsyTemplates(category, artist);
    expect(result.tags).toHaveLength(13);
  });

  it('materials are additive and deduplicated', () => {
    const category: EtsyListingDefaults = {
      materials: ['clay', 'glaze'],
    };
    const artist: EtsyListingDefaults = {
      materials: ['glaze', 'stoneware'],
    };

    const result = mergeEtsyTemplates(category, artist);
    expect(result.materials).toEqual(['clay', 'glaze', 'stoneware']);
  });

  it('returns undefined for tags and materials when both are empty', () => {
    const category: EtsyListingDefaults = { tags: [], materials: [] };
    const artist: EtsyListingDefaults = { tags: [], materials: [] };

    const result = mergeEtsyTemplates(category, artist);
    expect(result.tags).toBeUndefined();
    expect(result.materials).toBeUndefined();
  });
});
