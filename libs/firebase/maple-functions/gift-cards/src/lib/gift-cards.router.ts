/**
 * giftCards — the admin Gift Cards page, as one Cloud Function in
 * `maple-square` (ADR-029, #297).
 *
 * Square owns every card. The admin routes read balances, history and (on
 * request) a card's code back from Square for Katie. They are admin only: a
 * card's code is as good as cash.
 *
 * Four admin routes write: `markClassCertificate` records that a card sold
 * at the register is a class certificate (no Square write), `issueGiftCard`
 * makes and loads a free card in Square (#310), `printGiftCertificates`
 * makes a batch of printed certificates with no money on them (#314, #332),
 * `replaceGiftCard` moves a lost card's balance to a new card (#332), and
 * `closeGiftCard` refunds a card bought online and turns it off, or turns any
 * card off.
 * `getGiftCardBuyer` and `searchGiftCardsByCustomer` read customers from
 * Square (#332).
 *
 * `purchaseGiftCard` is the one public route (#300): the Webflow buy page
 * sells a card through it. It is gated the way every public widget payment is
 * (ADR-037): App Check enforced, and throttled per IP and per buyer email.
 *
 * Each route spells its gate and secrets out in full:
 * `tools/check-callable-roles.ts` reads `requiringRole` off the AST and cannot
 * see through a helper.
 */
import {
  Functions,
  Role,
  codeLookupThrottles,
  paymentThrottles,
} from '@maple/firebase/functions';
import {
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import type {
  GetCertificateBatchRequest,
  GetCertificateBatchResponse,
  GetGiftCardBuyerRequest,
  GetGiftCardBuyerResponse,
  ReplaceGiftCardRequest,
  ReplaceGiftCardResponse,
  CloseGiftCardRequest,
  CloseGiftCardResponse,
  SearchGiftCardsByCustomerRequest,
  SearchGiftCardsByCustomerResponse,
  GetGiftCardRequest,
  GetGiftCardResponse,
  GetGiftCardsRequest,
  GetGiftCardsResponse,
  IssueGiftCardRequest,
  IssueGiftCardResponse,
  MarkClassCertificateRequest,
  MarkClassCertificateResponse,
  PrintGiftCertificatesRequest,
  PrintGiftCertificatesResponse,
  PreviewGiftCardForClassRequest,
  PreviewGiftCardForClassResponse,
  PurchaseGiftCardRequest,
  PurchaseGiftCardResponse,
  RevealGiftCardCodeRequest,
  RevealGiftCardCodeResponse,
} from '@maple/ts/firebase/api-types';
import {
  getGiftCard,
  getGiftCards,
  revealGiftCardCode,
} from './gift-cards.handlers';
import { previewGiftCardForClass } from './preview-gift-card-for-class';
import { purchaseGiftCard } from './purchase-gift-card';
import {
  getCertificateBatch,
  printGiftCertificates,
} from './print-gift-certificates';
import {
  issueGiftCard,
  markClassCertificate,
} from './gift-card-admin-actions';
import {
  getGiftCardBuyer,
  searchGiftCardsByCustomer,
} from './gift-card-customers';
import { replaceGiftCard } from './replace-gift-card';
import { closeGiftCard } from './close-gift-card';

export const giftCards = Functions.router('giftCards', {
  /** Every card and this month's totals. */
  getGiftCards: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<GetGiftCardsRequest, GetGiftCardsResponse>((data, context, secrets, strings) =>
      getGiftCards(data, context, secrets, strings)
    ),

  /** One card and its full history. */
  getGiftCard: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<GetGiftCardRequest, GetGiftCardResponse>(getGiftCard),

  /** A card's full code, for a printed certificate. Each reveal is logged. */
  revealGiftCardCode: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<RevealGiftCardCodeRequest, RevealGiftCardCodeResponse>(
      revealGiftCardCode
    ),

  /**
   * A card sold at the register becomes a class certificate for one class
   * type. Writes our record only; nothing changes in Square.
   */
  markClassCertificate: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<MarkClassCertificateRequest, MarkClassCertificateResponse>(
      markClassCertificate
    ),

  /**
   * The studio gives a free card: makes a digital card in Square and loads it
   * without a sale. Logged with who gave it and why, never with the code.
   */
  issueGiftCard: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<IssueGiftCardRequest, IssueGiftCardResponse>(issueGiftCard),

  /**
   * Print a batch of certificates (#314, #332): makes each card in Square
   * with a MAPLE code and no money on it; the register loads it when it is
   * sold. Retry-safe.
   */
  printGiftCertificates: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<PrintGiftCertificatesRequest, PrintGiftCertificatesResponse>(
      (data, context, secrets, strings) =>
        printGiftCertificates(data, context, secrets, strings)
    ),

  /**
   * Every full code in a printed batch, for the print view only (#314).
   * Logged with who asked and how many, never with the codes.
   */
  getCertificateBatch: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<GetCertificateBatchRequest, GetCertificateBatchResponse>(
      getCertificateBatch
    ),

  /**
   * Who bought a card at the register (#332), read live from Square: the
   * order that loaded it and the customer on that order. Never stored.
   */
  getGiftCardBuyer: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<GetGiftCardBuyerRequest, GetGiftCardBuyerResponse>(getGiftCardBuyer),

  /**
   * Find cards by a customer's name, email or phone (#332). Logged with
   * counts only, never the query.
   */
  searchGiftCardsByCustomer: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<SearchGiftCardsByCustomerRequest, SearchGiftCardsByCustomerResponse>(
      (data, context, secrets, strings) =>
        searchGiftCardsByCustomer(data, context, secrets, strings)
    ),

  /**
   * Replace a lost card (#332): moves its balance to a new card, then turns
   * it off. Idempotent per click; never leaves the balance on both cards.
   */
  replaceGiftCard: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<ReplaceGiftCardRequest, ReplaceGiftCardResponse>(replaceGiftCard),

  /**
   * Refund a card bought online and turn it off, or turn any card off. Takes
   * what is left off the card before any refund (see close-gift-card.ts).
   */
  closeGiftCard: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<CloseGiftCardRequest, CloseGiftCardResponse>(closeGiftCard),

  /**
   * Public (#301): what a gift card would pay toward a class at checkout.
   * Reads the card from Square and prices the order; charges nothing.
   */
  previewGiftCardForClass: Functions.endpoint
    .withAppCheck('enforce')
    .throttling('previewGiftCardForClass', codeLookupThrottles())
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<PreviewGiftCardForClassRequest, PreviewGiftCardForClassResponse>(
      previewGiftCardForClass
    ),

  /**
   * Public: a customer buys a gift card on the Webflow buy page. Charges the
   * card, makes and loads a Square gift card, and emails the code.
   */
  purchaseGiftCard: Functions.endpoint
    .withAppCheck('enforce')
    .throttling('purchaseGiftCard', paymentThrottles('buyerEmail'))
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES, 'ADMIN_ALERT_EMAIL')
    .asRoute<PurchaseGiftCardRequest, PurchaseGiftCardResponse>(purchaseGiftCard),
});
