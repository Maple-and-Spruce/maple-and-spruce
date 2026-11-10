import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findClass: vi.fn(),
  priceClassOrder: vi.fn(),
  readUsableGiftCard: vi.fn(),
  classCertificateCoverCents: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  priceClassOrder: mocks.priceClassOrder,
  throwInvalidArgument: (message: string) => {
    throw Object.assign(new Error(message), { code: 'invalid-argument' });
  },
}));
vi.mock('@maple/firebase/database', () => ({
  ClassRepository: { findById: mocks.findClass },
}));
vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(function () {
    return { taxRatePercent: 6 };
  }),
}));
vi.mock('@maple/firebase/maple-functions/create-registration', () => ({
  readUsableGiftCard: mocks.readUsableGiftCard,
  classCertificateCoverCents: mocks.classCertificateCoverCents,
}));

import { previewGiftCardForClass } from './preview-gift-card-for-class';

const secrets = { SQUARE_ACCESS_TOKEN: 't' };
const strings = { SQUARE_ENV: 'LOCAL', SQUARE_LOCATION_ID: 'L', SALES_TAX_RATE: '6' };
const openClass = {
  id: 'class-1',
  status: 'published',
  priceCents: 5500,
  categoryId: 'pottery',
  sessions: [{ dateTime: new Date('2099-01-01T15:00:00Z') }],
};
const request = { giftCardNonce: 'gftok:abc', classId: 'class-1', quantity: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findClass.mockResolvedValue(openClass);
  mocks.readUsableGiftCard.mockResolvedValue({
    card: { id: 'gc-1', last4: '4821', balanceCents: 5000, state: 'active' },
    purchase: { kind: 'class', valueCents: 5000, classCategoryId: 'pottery' },
  });
  mocks.priceClassOrder.mockResolvedValue({
    originalCostCents: 5500,
    discountAmountCents: 0,
    subtotalCents: 5500,
    taxAmountCents: 330,
    pricePaidCents: 5830,
  });
  mocks.classCertificateCoverCents.mockReturnValue(500);
});

vi.mock('@maple/ts/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@maple/ts/domain')>();
  return { ...actual, isClassRegistrationOpen: () => true };
});

describe('previewGiftCardForClass', () => {
  it('counts wrong numbers against the visitor the front end vouches for', async () => {
    await previewGiftCardForClass(
      request,
      { ip: '198.51.100.1', trustedIp: '192.0.2.10' },
      secrets,
      strings
    );
    expect(mocks.readUsableGiftCard).toHaveBeenCalledWith(
      expect.anything(),
      request.giftCardNonce,
      { clientIp: '192.0.2.10' }
    );
  });

  it('shows the certificate cover, the gift card share and what is left', async () => {
    const result = await previewGiftCardForClass(request, {}, secrets, strings);

    expect(mocks.priceClassOrder).toHaveBeenCalledWith(
      openClass,
      { quantity: 1, discountCode: undefined },
      6,
      { onInvalidDiscount: 'ignore' }
    );
    expect(mocks.classCertificateCoverCents).toHaveBeenCalledWith(
      expect.objectContaining({ classEntity: openClass, subtotalCents: 5500 })
    );
    expect(result).toEqual({
      last4: '4821',
      balanceCents: 5000,
      classCertificateCoverCents: 500,
      subtotalCents: 5500,
      taxAmountCents: 300,
      totalCents: 5300,
      giftCardAmountCents: 5000,
      leftToPayCents: 300,
    });
  });

  it('passes the discount code through for pricing', async () => {
    await previewGiftCardForClass(
      { ...request, quantity: 2, discountCode: 'SPRING' },
      {},
      secrets,
      strings
    );
    expect(mocks.priceClassOrder).toHaveBeenCalledWith(
      openClass,
      { quantity: 2, discountCode: 'SPRING' },
      6,
      { onInvalidDiscount: 'ignore' }
    );
  });

  it('passes on a plain-words refusal for the card', async () => {
    mocks.readUsableGiftCard.mockRejectedValue(
      new Error('This gift card has no money left on it.')
    );
    await expect(
      previewGiftCardForClass(request, {}, secrets, strings)
    ).rejects.toThrow('no money left');
  });

  it.each([
    [{ ...request, giftCardNonce: '' }, 'Gift card is required'],
    [{ ...request, classId: '' }, 'Class ID is required'],
    [{ ...request, quantity: 0 }, 'Quantity must be at least 1'],
  ])('rejects a bad request', async (bad, message) => {
    await expect(
      previewGiftCardForClass(bad, {}, secrets, strings)
    ).rejects.toThrow(message);
    expect(mocks.readUsableGiftCard).not.toHaveBeenCalled();
  });

  it('refuses an unknown class', async () => {
    mocks.findClass.mockResolvedValue(undefined);
    await expect(
      previewGiftCardForClass(request, {}, secrets, strings)
    ).rejects.toThrow('Class not found');
  });
});
