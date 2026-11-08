import { describe, it, expect, vi, beforeEach } from 'vitest';

const repos = vi.hoisted(() => ({
  GiftCardSettingsRepository: { get: vi.fn() },
  ClassCategoryRepository: { findAll: vi.fn() },
}));
vi.mock('@maple/firebase/database', () => repos);

import { getGiftCardOptions } from './get-gift-card-options';

const amounts = { presetCents: [2500, 5000, 10000], minCents: 1000, maxCents: 50000 };
const now = new Date('2026-01-01T00:00:00Z');

describe('getGiftCardOptions (#309)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repos.GiftCardSettingsRepository.get.mockResolvedValue(amounts);
  });

  it('returns the amounts and only the switched-on, priced class types, in order', async () => {
    repos.ClassCategoryRepository.findAll.mockResolvedValue([
      {
        id: 'cat-pottery',
        name: 'Pottery',
        order: 0,
        giftCertificateEnabled: true,
        giftCertificatePriceCents: 6500,
        galleryImages: [{ url: 'https://img.example.com/bowl.jpg', alt: 'A glazed bowl' }],
        createdAt: now,
        updatedAt: now,
      },
      { id: 'cat-off', name: 'Woodworking', order: 10, giftCertificateEnabled: false, giftCertificatePriceCents: 9000, createdAt: now, updatedAt: now },
      { id: 'cat-noprice', name: 'Dyeing', order: 20, giftCertificateEnabled: true, createdAt: now, updatedAt: now },
      { id: 'cat-weave', name: 'Weaving', order: 30, giftCertificateEnabled: true, giftCertificatePriceCents: 4500, createdAt: now, updatedAt: now },
    ]);

    await expect(getGiftCardOptions({})).resolves.toEqual({
      amounts,
      classTypes: [
        {
          id: 'cat-pottery',
          name: 'Pottery',
          priceCents: 6500,
          imageUrl: 'https://img.example.com/bowl.jpg',
          imageAlt: 'A glazed bowl',
        },
        { id: 'cat-weave', name: 'Weaving', priceCents: 4500 },
      ],
    });
  });

  it('returns no class types when none are switched on', async () => {
    repos.ClassCategoryRepository.findAll.mockResolvedValue([]);
    await expect(getGiftCardOptions({})).resolves.toEqual({ amounts, classTypes: [] });
  });
});
