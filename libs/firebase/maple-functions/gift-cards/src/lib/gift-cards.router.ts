/**
 * giftCards — the admin Gift Cards page, as one Cloud Function in
 * `maple-square` (ADR-029, #297).
 *
 * Square owns every card. The admin routes read balances, history and (on
 * request) a card's code back from Square for Katie. They are admin only: a
 * card's code is as good as cash.
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
  GetGiftCardRequest,
  GetGiftCardResponse,
  GetGiftCardsRequest,
  GetGiftCardsResponse,
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
