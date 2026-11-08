import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./utilities/database.config', () => {
  const docRef = { id: 'cat-pottery', get: mocks.get, set: mocks.set, update: mocks.update };
  return {
    db: { collection: () => ({ doc: () => docRef }) },
    toDate: (value: unknown): Date => (value instanceof Date ? value : new Date(String(value))),
  };
});

import { ClassCategoryRepository } from './class-category.repository';

const createdAt = new Date('2026-01-01T00:00:00Z');

function snapshot(data: Record<string, unknown>) {
  return { id: 'cat-pottery', exists: true, data: () => data };
}

describe('ClassCategoryRepository gift certificate fields (#309)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the switch and the certificate price back', async () => {
    mocks.get.mockResolvedValue(
      snapshot({
        name: 'Pottery',
        order: 0,
        giftCertificateEnabled: true,
        giftCertificatePriceCents: 6500,
        createdAt,
        updatedAt: createdAt,
      })
    );

    const category = await ClassCategoryRepository.findById('cat-pottery');

    expect(category).toMatchObject({
      id: 'cat-pottery',
      giftCertificateEnabled: true,
      giftCertificatePriceCents: 6500,
    });
  });

  it('reads a category stored before #309 as switched off', async () => {
    mocks.get.mockResolvedValue(
      snapshot({ name: 'Weaving', order: 10, createdAt, updatedAt: createdAt })
    );
    const category = await ClassCategoryRepository.findById('cat-pottery');
    expect(category?.giftCertificateEnabled).toBeUndefined();
    expect(category?.giftCertificatePriceCents).toBeUndefined();
  });

  it('writes both fields on create and on update', async () => {
    await ClassCategoryRepository.create({
      name: 'Pottery',
      order: 0,
      giftCertificateEnabled: true,
      giftCertificatePriceCents: 6500,
    });
    expect(mocks.set.mock.calls[0][0]).toMatchObject({
      giftCertificateEnabled: true,
      giftCertificatePriceCents: 6500,
    });

    mocks.get.mockResolvedValue(
      snapshot({ name: 'Pottery', order: 0, giftCertificateEnabled: false, createdAt, updatedAt: createdAt })
    );
    await ClassCategoryRepository.update({ id: 'cat-pottery', giftCertificateEnabled: false });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ giftCertificateEnabled: false });
  });
});
