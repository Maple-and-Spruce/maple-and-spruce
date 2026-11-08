/**
 * The admin Gift Cards page (#297). Everything is read live from Square.
 */
import type {
  GiftCardActivityEntry,
  GiftCardPurchaseKind,
  GiftCardSummary,
  GiftCardTotals,
} from '@maple/ts/domain';
import type { GiftCardPurchaseDetails } from './gift-card-purchase.types';

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
  /** Set when the card was bought on our own buy page (#300). */
  purchase?: GiftCardPurchaseDetails;
}

export interface RevealGiftCardCodeRequest {
  id: string;
}

export interface RevealGiftCardCodeResponse {
  /** The full card code. Treat it like cash. */
  code: string;
}

/**
 * `giftCards/markClassCertificate` (#310): a card sold at the register becomes
 * a class certificate for one class type. Writes our record only; nothing
 * changes in Square.
 */
export interface MarkClassCertificateRequest {
  giftCardId: string;
  /** The class type (class category) the certificate covers. */
  classCategoryId: string;
  /** Who it is for, as written on the certificate. */
  recipientName?: string;
  /** Who it is from, as written on the certificate. */
  fromName?: string;
  message?: string;
}

export interface MarkClassCertificateResponse {
  purchase: GiftCardPurchaseDetails;
}

interface IssueGiftCardBase {
  /** Why the studio is giving it, in Katie's words. 3 to 200 characters. */
  reason: string;
  recipientName?: string;
  fromName?: string;
  message?: string;
  /**
   * Made by the dialog once each time it opens. Every Square key is derived
   * from it, so a retried request makes one card, not two.
   */
  idempotencyKey: string;
}

/**
 * `giftCards/issueGiftCard` (#310): the studio gives a free card. A dollar
 * amount, or a class certificate for one class type at a value Katie enters.
 * Both are whole dollars, $5 to $500.
 */
export type IssueGiftCardRequest =
  | (IssueGiftCardBase & { kind: 'amount'; amountCents: number })
  | (IssueGiftCardBase & {
      kind: 'class';
      classCategoryId: string;
      valueCents: number;
    });

export interface IssueGiftCardResponse {
  giftCardId: string;
  /** Last 4 digits only; the full code comes from `revealGiftCardCode`. */
  last4: string;
  kind: GiftCardPurchaseKind;
  valueCents: number;
  /** For a class certificate, the class type's name. */
  className?: string;
  /**
   * False when the card was made and loaded but our record of it could not be
   * written. The card still works; it just shows no "Given free" box.
   */
  recorded: boolean;
}
