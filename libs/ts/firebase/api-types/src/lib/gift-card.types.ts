/**
 * The admin Gift Cards page (#297). Everything is read live from Square.
 */
import type {
  GiftCardActivityEntry,
  GiftCardListItem,
  GiftCardPurchaseKind,
  GiftCardSummary,
  GiftCardTotals,
  GiftCertificateDesignId,
} from '@maple/ts/domain';
import type { GiftCardPurchaseDetails } from './gift-card-purchase.types';

export type GetGiftCardsRequest = Record<string, never>;

export interface GetGiftCardsResponse {
  totals: GiftCardTotals;
  /**
   * Every card, newest first, with how it came about when we have a record
   * (#314). Never includes a full code.
   */
  cards: GiftCardListItem[];
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
  /**
   * A code the studio chooses instead of Square's number, e.g.
   * "FERN REEL HARP 4821". Spaces and dashes are ignored. 8 to 20 letters and
   * digits; Square refuses one already in use.
   */
  code?: string;
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

/**
 * `giftCards/printGiftCertificates` (#314): make and load a batch of printed
 * certificates. Each is a real Square card, spendable as soon as it exists.
 * A dollar amount ($5 to $500, whole dollars), or one class of a class type
 * that has certificates switched on, at the type's certificate price.
 */
export type PrintGiftCertificatesRequest = (
  | { kind: 'amount'; amountCents: number }
  | { kind: 'class'; classCategoryId: string }
) & {
  /** 1 to 50. */
  quantity: number;
  design: GiftCertificateDesignId;
  /**
   * Made by the dialog once each time it opens. The batch id and every Square
   * key are derived from it, so a retry finishes the same batch instead of
   * starting a second one.
   */
  idempotencyKey: string;
};

export interface PrintedCertificateCard {
  giftCardId: string;
  last4: string;
}

export interface PrintGiftCertificatesResponse {
  batchId: string;
  /** How many were asked for. */
  requested: number;
  /** The certificates that exist, loaded and recorded, in batch order. */
  cards: PrintedCertificateCard[];
  /** What is on each, in cents. */
  valueCents: number;
  /**
   * Set when some certificates could not be made. The ones in `cards` are
   * loaded and fine; trying again with the same dialog makes the rest.
   */
  error?: string;
}

export interface GetCertificateBatchRequest {
  batchId: string;
}

export interface PrintableCertificate {
  giftCardId: string;
  last4: string;
  /** The full code, for printing only. Treat it like cash; never store it. */
  code: string;
}

/**
 * `giftCards/getCertificateBatch` (#314): one printed batch with every full
 * code, for the print view only. Logged with who asked.
 */
export interface GetCertificateBatchResponse {
  batchId: string;
  design: GiftCertificateDesignId;
  kind: GiftCardPurchaseKind;
  valueCents: number;
  /** For a class batch, the class type's name. */
  className?: string;
  /** In batch order. */
  certificates: PrintableCertificate[];
}
