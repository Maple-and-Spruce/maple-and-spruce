import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The interest entry is an idempotent, email-keyed FULL-DOCUMENT `set`, which
 * is what makes its Meta attribution interesting: a naive rewrite blanks the
 * `_fbc` click id captured on the family's original ad-driven visit, silently
 * severing the only link between them and the campaign that produced them.
 */
const state = vi.hoisted(() => ({
  existingExists: false,
  existingData: undefined as Record<string, unknown> | undefined,
  setCalls: [] as Record<string, unknown>[],
}));

vi.mock('./utilities/database.config', () => {
  const docRef = {
    get: async () => ({
      exists: state.existingExists,
      data: () => state.existingData,
    }),
    set: async (data: Record<string, unknown>) => {
      state.setCalls.push(data);
    },
  };
  const db = { collection: () => ({ doc: () => docRef }) };
  return {
    getDb: () => db,
    toDate: (v: unknown) => (v instanceof Date ? v : new Date(v as string)),
  };
});

import { MusicTogetherInterestRepository } from './music-together-interest.repository';

const entry = {
  name: 'Jamie Rivera',
  email: 'Jamie@Example.com',
  interestedSectionIds: ['sec-1'],
};

describe('MusicTogetherInterestRepository.upsert — Meta attribution', () => {
  beforeEach(() => {
    state.existingExists = false;
    state.existingData = undefined;
    state.setCalls = [];
  });

  it('stores the cookies and request context on a new signup', async () => {
    await MusicTogetherInterestRepository.upsert(entry, {
      fbp: 'fb.1.1700000000000.111',
      fbc: 'fb.1.1700000000000.IwAR-click',
      eventSourceUrl:
        'https://mapleandsprucefolkarts.com/music-together-interest',
      clientIp: '198.51.100.7',
      clientUserAgent: 'Mozilla/5.0',
    });

    expect(state.setCalls[0]).toMatchObject({
      fbp: 'fb.1.1700000000000.111',
      fbc: 'fb.1.1700000000000.IwAR-click',
      clientIp: '198.51.100.7',
      clientUserAgent: 'Mozilla/5.0',
    });
  });

  it('writes explicit nulls rather than omitting the fields', async () => {
    await MusicTogetherInterestRepository.upsert(entry);
    expect(state.setCalls[0]).toMatchObject({
      fbp: null,
      fbc: null,
      eventSourceUrl: null,
      clientIp: null,
      clientUserAgent: null,
    });
  });

  it('KEEPS the original click id when a re-submit carries none', async () => {
    // The family came from an ad in March and refined their section picks in
    // April from a bookmark. Blanking `_fbc` here would discard the only thing
    // that ties them to the campaign.
    state.existingExists = true;
    state.existingData = {
      createdAt: new Date('2026-03-01T00:00:00Z'),
      fbp: 'fb.1.1.original-p',
      fbc: 'fb.1.1.original-click',
      eventSourceUrl: 'https://mapleandsprucefolkarts.com/music-together',
      clientIp: '198.51.100.1',
      clientUserAgent: 'Mozilla/5.0 (Original)',
    };

    await MusicTogetherInterestRepository.upsert(entry, {
      clientIp: '198.51.100.9',
      clientUserAgent: 'Mozilla/5.0 (Today)',
    });

    expect(state.setCalls[0]).toMatchObject({
      fbp: 'fb.1.1.original-p',
      fbc: 'fb.1.1.original-click',
      eventSourceUrl: 'https://mapleandsprucefolkarts.com/music-together',
      // A value we DID observe this time still wins.
      clientIp: '198.51.100.9',
      clientUserAgent: 'Mozilla/5.0 (Today)',
    });
  });

  it('prefers a FRESH click id over the stored one', async () => {
    // A second ad click is more recent attribution than the first.
    state.existingExists = true;
    state.existingData = {
      createdAt: new Date('2026-03-01T00:00:00Z'),
      fbc: 'fb.1.1.original-click',
    };

    await MusicTogetherInterestRepository.upsert(entry, {
      fbc: 'fb.1.2.newer-click',
    });

    expect(state.setCalls[0]).toMatchObject({ fbc: 'fb.1.2.newer-click' });
  });

  it('preserves the original createdAt across a re-submit', async () => {
    state.existingExists = true;
    state.existingData = { createdAt: new Date('2026-03-01T00:00:00Z') };

    const { created } = await MusicTogetherInterestRepository.upsert(entry);

    expect(created).toBe(false);
    expect(state.setCalls[0]['createdAt']).toEqual(
      new Date('2026-03-01T00:00:00Z')
    );
  });
});
