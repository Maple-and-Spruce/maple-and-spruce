import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
}));

vi.mock('./utilities/database.config', () => {
  const docRef = { create: mocks.create, get: mocks.get };
  const collectionRef = { doc: mocks.doc.mockReturnValue(docRef) };
  return {
    getDb: () => ({ collection: mocks.collection.mockReturnValue(collectionRef) }),
    toDate: (value: unknown): Date => (value instanceof Date ? value : new Date(String(value))),
  };
});

import { GiftCardPurchaseRepository } from './gift-card-purchase.repository';

const purchase = {
  giftCardId: 'gftc-1',
  last4: '4821',
  kind: 'class' as const,
  valueCents: 6000,
  classId: 'class-1',
  classCategoryId: 'cat-pottery',
  className: 'Wheel Throwing Basics',
  buyerName: 'Robin Ashfield',
  buyerEmail: 'robin@example.com',
  recipientName: 'Olive Thompson',
  recipientEmail: 'olive@example.com',
  message: 'Happy holidays!',
  deliverTo: 'recipient' as const,
  squareOrderId: 'order-1',
  squarePaymentId: 'pay-1',
};

describe('GiftCardPurchaseRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the record under the gift card id, without the id in the fields', async () => {
    mocks.create.mockResolvedValue(undefined);

    const created = await GiftCardPurchaseRepository.create(purchase);

    expect(mocks.collection).toHaveBeenCalledWith('giftCardPurchases');
    expect(mocks.doc).toHaveBeenCalledWith('gftc-1');
    const written = mocks.create.mock.calls[0][0];
    expect(written).not.toHaveProperty('giftCardId');
    expect(written).toMatchObject({ kind: 'class', classCategoryId: 'cat-pottery' });
    expect(written.createdAt).toBeInstanceOf(Date);
    expect(created).toMatchObject(purchase);
  });

  it('leaves out optional fields that are not set, which Firestore would reject', async () => {
    mocks.create.mockResolvedValue(undefined);
    await GiftCardPurchaseRepository.create({
      ...purchase,
      kind: 'amount',
      classId: undefined,
      classCategoryId: undefined,
      className: undefined,
      recipientName: undefined,
      recipientEmail: undefined,
      message: undefined,
      deliverTo: 'buyer',
    });
    const written = mocks.create.mock.calls[0][0];
    expect(Object.values(written)).not.toContain(undefined);
    expect(written).not.toHaveProperty('classCategoryId');
  });

  it('reads every field back', async () => {
    const createdAt = new Date('2026-11-20T15:00:00Z');
    const { giftCardId, ...fields } = purchase;
    mocks.get.mockResolvedValue({
      exists: true,
      id: giftCardId,
      data: () => ({ ...fields, createdAt }),
    });

    await expect(GiftCardPurchaseRepository.findByGiftCardId('gftc-1')).resolves.toEqual({
      ...purchase,
      createdAt,
    });
  });

  it('reads back a free card the studio gave, with no buyer or order (#310)', async () => {
    const createdAt = new Date('2026-11-20T15:00:00Z');
    mocks.get.mockResolvedValue({
      exists: true,
      id: 'gftc-2',
      data: () => ({
        last4: '0007',
        kind: 'amount',
        valueCents: 2500,
        source: 'issued',
        reason: 'Raffle prize',
        recipientName: 'Olive Thompson',
        fromName: 'Maple & Spruce',
        recordedByUid: 'admin-1',
        createdAt,
      }),
    });

    const read = await GiftCardPurchaseRepository.findByGiftCardId('gftc-2');

    expect(read).toEqual({
      giftCardId: 'gftc-2',
      last4: '0007',
      kind: 'amount',
      valueCents: 2500,
      source: 'issued',
      reason: 'Raffle prize',
      recipientName: 'Olive Thompson',
      fromName: 'Maple & Spruce',
      recordedByUid: 'admin-1',
      createdAt,
      classId: undefined,
      classCategoryId: undefined,
      className: undefined,
      buyerName: undefined,
      buyerEmail: undefined,
      recipientEmail: undefined,
      message: undefined,
      deliverTo: undefined,
      squareOrderId: undefined,
      squarePaymentId: undefined,
    });
  });

  it('returns undefined for a card bought somewhere else', async () => {
    mocks.get.mockResolvedValue({ exists: false });
    await expect(GiftCardPurchaseRepository.findByGiftCardId('nope')).resolves.toBeUndefined();
  });
});
