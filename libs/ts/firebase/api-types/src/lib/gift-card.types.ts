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
 * `giftCards/printGiftCertificates` (#314, #332): make a batch of printed
 * certificates. Each is a real Square card with a `MAPLE` code and no money
 * on it until the register loads it at the sale.
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
  /** The certificates that exist and are recorded, in batch order. */
  cards: PrintedCertificateCard[];
  /** What each certificate says it is worth, in cents. Nothing is on it yet. */
  valueCents: number;
  /**
   * Set when some certificates could not be made. The ones in `cards` are
   * fine; trying again with the same dialog makes the rest.
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

/** A Square customer, as the admin shows one (#332). Admin only. */
export interface GiftCardCustomer {
  /** Square customer id. */
  id: string;
  /** Given and family name together, when Square has either. */
  name?: string;
  email?: string;
  phone?: string;
}

export interface GetGiftCardBuyerRequest {
  /** Square gift card id. */
  id: string;
}

/**
 * `giftCards/getGiftCardBuyer` (#332): who bought a card at the register,
 * read live from Square each time and never stored. The card's first
 * activation (or first load) names the Square order that sold it, and the
 * order names the customer Katie added at the register.
 */
export interface GetGiftCardBuyerResponse {
  /** The register sale that loaded the card. Missing when no order did. */
  sale?: {
    /** When it was loaded (ISO 8601). */
    soldAt: string;
    orderId: string;
    /** Missing when no customer was added to the sale. */
    customer?: GiftCardCustomer;
  };
  /** Customers Square has linked to the card itself, if any. */
  linkedCustomers: GiftCardCustomer[];
}

export interface SearchGiftCardsByCustomerRequest {
  /** A name, an email address or a phone number, as typed. 2 to 100 characters. */
  query: string;
}

/** One customer the search matched, and their cards. */
export interface GiftCardCustomerMatch {
  customer: GiftCardCustomer;
  /** Ids of the customer's cards, in the `cards` list of the response. */
  giftCardIds: string[];
}

/**
 * `giftCards/searchGiftCardsByCustomer` (#332): find cards by the customer
 * on them. Square customers matching the query (at most
 * `GIFT_CARD_CUSTOMER_MATCH_LIMIT` in `@maple/ts/domain`), and every card linked to one of them or
 * sold to one of them since `searchedSince`.
 */
export interface SearchGiftCardsByCustomerResponse {
  matches: GiftCardCustomerMatch[];
  /** Every card found, newest first, labelled like the main list. */
  cards: GiftCardListItem[];
  /** Register sales are looked for from this date on (ISO 8601). */
  searchedSince: string;
  /** How the query was read: an email, a phone number or a name. */
  searchedBy: 'email' | 'phone' | 'name';
}

export interface ReplaceGiftCardRequest {
  /** The lost card. */
  giftCardId: string;
  /**
   * Made by the dialog once each time it opens. A retry of the same click
   * makes no second card and moves no money twice.
   */
  idempotencyKey: string;
}

/**
 * `giftCards/replaceGiftCard` (#332): move a lost card's balance to a new
 * card and turn the lost one off.
 */
export interface ReplaceGiftCardResponse {
  oldGiftCardId: string;
  newGiftCardId: string;
  /** Last 4 of the new card; its code comes from `revealGiftCardCode`. */
  last4: string;
  /** What was moved, in cents. */
  balanceCents: number;
  /**
   * Set when the money is on the new card but Square did not turn the old
   * card off. The old card holds nothing, so nothing can be spent from it;
   * trying again turns it off.
   */
  warning?: string;
}
