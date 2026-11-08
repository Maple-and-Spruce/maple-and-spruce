import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('./utilities/database.config', () => {
  const docRef = { get: mocks.get, set: mocks.set };
  const collectionRef = { doc: mocks.doc.mockReturnValue(docRef) };
  return {
    getDb: () => ({ collection: mocks.collection.mockReturnValue(collectionRef) }),
  };
});

import { GiftCardSettingsRepository } from './gift-card-settings.repository';

const stored = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

describe('GiftCardSettingsRepository (#309)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads appConfig/giftCards', async () => {
    mocks.get.mockResolvedValue(stored(undefined));
    await GiftCardSettingsRepository.get();
    expect(mocks.collection).toHaveBeenCalledWith('appConfig');
    expect(mocks.doc).toHaveBeenCalledWith('giftCards');
  });

  it('reads as the shipped amounts until it is edited', async () => {
    mocks.get.mockResolvedValue(stored(undefined));
    expect(await GiftCardSettingsRepository.get()).toEqual({
      presetCents: [2500, 5000, 10000],
      minCents: 1000,
      maxCents: 50000,
    });
  });

  it('reads back every stored field, presets smallest first', async () => {
    mocks.get.mockResolvedValue(
      stored({ presetCents: [7500, 2000], minCents: 500, maxCents: 100000, updatedByUid: 'u' })
    );
    expect(await GiftCardSettingsRepository.get()).toEqual({
      presetCents: [2000, 7500],
      minCents: 500,
      maxCents: 100000,
    });
  });

  it('falls back field by field on junk', async () => {
    mocks.get.mockResolvedValue(stored({ presetCents: ['25'], minCents: -1, maxCents: 20000 }));
    expect(await GiftCardSettingsRepository.get()).toEqual({
      presetCents: [2500, 5000, 10000],
      minCents: 1000,
      maxCents: 20000,
    });
  });

  it('writes the settings with the editor and returns what reads back', async () => {
    mocks.set.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue(stored({ presetCents: [2000, 4000], minCents: 500, maxCents: 80000 }));

    const saved = await GiftCardSettingsRepository.set(
      { presetCents: [4000, 2000], minCents: 500, maxCents: 80000 },
      'uid-katie'
    );

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        presetCents: [2000, 4000],
        minCents: 500,
        maxCents: 80000,
        updatedByUid: 'uid-katie',
        updatedAt: expect.any(Date),
      }),
      { merge: true }
    );
    expect(saved).toEqual({ presetCents: [2000, 4000], minCents: 500, maxCents: 80000 });
  });
});
