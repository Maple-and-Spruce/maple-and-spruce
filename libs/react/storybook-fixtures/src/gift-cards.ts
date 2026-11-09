/**
 * Gift cards for stories (#297). Invented; the codes are Square's sandbox
 * test-card shape and spend nothing.
 */
import type {
  GiftCardActivityEntry,
  GiftCardListItem,
  GiftCardSummary,
  GiftCardTotals,
} from '@maple/ts/domain';

export const mockGiftCards: GiftCardSummary[] = [
  {
    id: 'gftc-holiday-1',
    last4: '4821',
    kind: 'egift',
    state: 'active',
    balanceCents: 5000,
    createdAt: '2026-11-21T19:12:00Z',
  },
  {
    id: 'gftc-holiday-2',
    last4: '0937',
    kind: 'egift',
    state: 'active',
    balanceCents: 1250,
    createdAt: '2026-11-14T16:40:00Z',
  },
  {
    id: 'gftc-holiday-3',
    last4: '7710',
    kind: 'plastic',
    state: 'active',
    balanceCents: 0,
    createdAt: '2026-11-02T14:05:00Z',
  },
  {
    id: 'gftc-holiday-4',
    last4: '3302',
    kind: 'egift',
    state: 'blocked',
    balanceCents: 2500,
    createdAt: '2026-10-28T13:00:00Z',
  },
];

/** A printed certificate and a free card, as the list labels them (#314). */
export const mockLabelledGiftCards: GiftCardListItem[] = [
  {
    id: 'gftc-stock-1',
    last4: '9482',
    kind: 'egift',
    state: 'pending',
    balanceCents: 0,
    createdAt: '2026-11-22T15:00:00Z',
    source: 'stock',
    batchId: 'cert-0a1b2c3d4e5f6071',
  },
  {
    id: 'gftc-free-1',
    last4: '6262',
    kind: 'egift',
    state: 'active',
    balanceCents: 1000,
    createdAt: '2026-11-22T14:00:00Z',
    source: 'issued',
  },
  ...mockGiftCards,
];

/** A printed batch with its codes, for the print view (#314). Invented codes. */
export const mockCertificateBatch = {
  batchId: 'cert-0a1b2c3d4e5f6071',
  design: 'stained-glass' as const,
  kind: 'amount' as const,
  valueCents: 2500,
  certificates: [
    // Year 2099 so an invented code can never be a real certificate's.
    { giftCardId: 'gftc-stock-1', last4: '9482', code: 'MAPLE2099482' },
    { giftCardId: 'gftc-stock-2', last4: '9017', code: 'MAPLE2099017' },
  ],
};

export const mockGiftCardTotals: GiftCardTotals = {
  outstandingCents: 6250,
  cardsWithBalance: 2,
  loadedThisMonthCents: 12500,
  spentThisMonthCents: 4250,
  givenFreeThisMonthCents: 2500,
  printedNotSoldCount: 10,
};

/** The full code of `gftc-holiday-1`, for the reveal story. */
export const mockGiftCardCode = '7783320000004821';

export const mockGiftCardActivities: GiftCardActivityEntry[] = [
  {
    id: 'gcact-3',
    giftCardId: 'gftc-holiday-2',
    type: 'redeem',
    amountCents: -3750,
    balanceAfterCents: 1250,
    createdAt: '2026-11-20T18:30:00Z',
  },
  {
    id: 'gcact-2',
    giftCardId: 'gftc-holiday-2',
    type: 'load',
    amountCents: 2500,
    balanceAfterCents: 5000,
    createdAt: '2026-11-16T15:00:00Z',
  },
  {
    id: 'gcact-1',
    giftCardId: 'gftc-holiday-2',
    type: 'activate',
    amountCents: 2500,
    balanceAfterCents: 2500,
    createdAt: '2026-11-14T16:40:00Z',
  },
];
