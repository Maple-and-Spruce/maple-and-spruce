import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  where: vi.fn(),
  queryGet: vi.fn(),
}));

vi.mock('./utilities/database.config', () => {
  const docRef = { create: mocks.create, get: mocks.get };
  const collectionRef = {
    doc: mocks.doc.mockReturnValue(docRef),
    where: mocks.where.mockReturnValue({
      get: mocks.queryGet,
      limit: () => ({ get: mocks.queryGet }),
    }),
  };
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

  it('reads back a printed certificate with its batch and design (#314)', async () => {
    const createdAt = new Date('2026-11-20T15:00:00Z');
    mocks.get.mockResolvedValue({
      exists: true,
      id: 'gftc-3',
      data: () => ({
        last4: '0042',
        kind: 'amount',
        valueCents: 2500,
        source: 'stock',
        batchId: 'batch-abc',
        batchIndex: 3,
        design: 'stained-glass',
        recordedByUid: 'admin-1',
        createdAt,
      }),
    });

    await expect(
      GiftCardPurchaseRepository.findByGiftCardId('gftc-3')
    ).resolves.toMatchObject({
      source: 'stock',
      batchId: 'batch-abc',
      batchIndex: 3,
      design: 'stained-glass',
    });
  });

  const queryDoc = (id: string, data: Record<string, unknown>) => ({
    exists: true,
    id,
    data: () => ({ last4: '0001', kind: 'amount', valueCents: 2500, createdAt: new Date(), ...data }),
  });

  it('reads records from several sources in one query (#314)', async () => {
    mocks.queryGet.mockResolvedValue({
      docs: [queryDoc('a', { source: 'stock' }), queryDoc('b', { source: 'issued' })],
    });

    const records = await GiftCardPurchaseRepository.findBySources(['issued', 'stock']);

    expect(mocks.where).toHaveBeenCalledTimes(1);
    expect(mocks.where).toHaveBeenCalledWith('source', 'in', ['issued', 'stock']);
    expect(records.map((r) => r.giftCardId)).toEqual(['a', 'b']);
  });

  it('asks nothing for no sources', async () => {
    await expect(GiftCardPurchaseRepository.findBySources([])).resolves.toEqual([]);
    expect(mocks.where).not.toHaveBeenCalled();
  });

  it('reads one batch in batch order (#314)', async () => {
    mocks.queryGet.mockResolvedValue({
      docs: [
        queryDoc('second', { batchId: 'b1', batchIndex: 1 }),
        queryDoc('first', { batchId: 'b1', batchIndex: 0 }),
      ],
    });

    const batch = await GiftCardPurchaseRepository.findByBatchId('b1');

    expect(mocks.where).toHaveBeenCalledWith('batchId', '==', 'b1');
    expect(batch.map((r) => r.giftCardId)).toEqual(['first', 'second']);
  });

  it('reads back a replacement with the card it replaces (#332)', async () => {
    mocks.queryGet.mockResolvedValue({
      docs: [
        queryDoc('gftc-new', {
          last4: '0042',
          kind: 'amount',
          valueCents: 1800,
          source: 'replacement',
          replacesGiftCardId: 'gftc-lost',
          recordedByUid: 'admin-1',
          createdAt: new Date('2026-11-02T15:00:00Z'),
        }),
      ],
    });

    const found = await GiftCardPurchaseRepository.findByReplacesGiftCardId('gftc-lost');

    expect(mocks.where).toHaveBeenCalledWith('replacesGiftCardId', '==', 'gftc-lost');
    expect(found).toMatchObject({
      giftCardId: 'gftc-new',
      source: 'replacement',
      replacesGiftCardId: 'gftc-lost',
      valueCents: 1800,
    });
  });

  it('finds no replacement for a card that was never replaced (#332)', async () => {
    mocks.queryGet.mockResolvedValue({ docs: [] });
    expect(await GiftCardPurchaseRepository.findByReplacesGiftCardId('x')).toBeUndefined();
  });
});
