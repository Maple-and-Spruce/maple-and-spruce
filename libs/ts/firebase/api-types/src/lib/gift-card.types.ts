/**
 * The admin Gift Cards page (#297). Everything is read live from Square.
 */
import type {
  GiftCardActivityEntry,
  GiftCardSummary,
  GiftCardTotals,
} from '@maple/ts/domain';

export type GetGiftCardsRequest = Record<string, never>;

export interface GetGiftCardsResponse {
  totals: GiftCardTotals;
  /** Every card, newest first. Never includes a full code. */
  cards: GiftCardSummary[];
  /** Start of "this month" for the totals (ISO 8601), midnight on the 1st Eastern. */
  monthStartedAt: string;
}

export interface GetGiftCardRequest {
  id: string;
}

export interface GetGiftCardResponse {
  card: GiftCardSummary;
  /** The card's history, newest first. */
  activities: GiftCardActivityEntry[];
}

export interface RevealGiftCardCodeRequest {
  id: string;
}

export interface RevealGiftCardCodeResponse {
  /** The full card code. Treat it like cash. */
  code: string;
}
