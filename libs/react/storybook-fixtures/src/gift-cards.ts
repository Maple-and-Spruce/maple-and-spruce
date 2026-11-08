/**
 * Gift cards for stories (#297). Invented; the codes are Square's sandbox
 * test-card shape and spend nothing.
 */
import type {
  GiftCardActivityEntry,
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

export const mockGiftCardTotals: GiftCardTotals = {
  outstandingCents: 6250,
  cardsWithBalance: 2,
  loadedThisMonthCents: 12500,
  spentThisMonthCents: 4250,
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
