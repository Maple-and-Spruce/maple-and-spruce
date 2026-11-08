/**
 * The admin Gift Cards page's reads (#297). Square owns every gift card, so
 * each call reads live from Square; nothing about a card is stored here.
 */
import {
  type FunctionContext,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  ClassCategoryRepository,
  GiftCardPurchaseRepository,
} from '@maple/firebase/database';
import {
  Square,
  type SquareSecrets,
  type SquareStrings,
} from '@maple/firebase/square';
import { startOfMonthInTimeZone, summarizeGiftCards } from '@maple/ts/domain';
import type {
  GiftCardPurchaseDetails,
  GetGiftCardRequest,
  GetGiftCardResponse,
  GetGiftCardsRequest,
  GetGiftCardsResponse,
  RevealGiftCardCodeRequest,
  RevealGiftCardCodeResponse,
} from '@maple/ts/firebase/api-types';

/** Every card plus this month's totals. */
export async function getGiftCards(
  _data: GetGiftCardsRequest,
  _context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings,
  now: Date = new Date()
): Promise<GetGiftCardsResponse> {
  const giftCards = new Square(secrets, strings).giftCardsService;
  const monthStart = startOfMonthInTimeZone(now);

  const [cards, activitiesThisMonth] = await Promise.all([
    giftCards.listGiftCards(),
    giftCards.listActivities({ beginTime: monthStart, endTime: now }),
  ]);

  return {
    totals: summarizeGiftCards(cards, activitiesThisMonth),
    cards,
    monthStartedAt: monthStart.toISOString(),
  };
}

/**
 * The record of a card bought on our own buy page, with the class type's name
 * for a class certificate. Undefined for a card sold any other way. A failed
 * read leaves it off rather than failing the whole dialog.
 */
async function readPurchase(
  giftCardId: string
): Promise<GiftCardPurchaseDetails | undefined> {
  try {
    const purchase = await GiftCardPurchaseRepository.findByGiftCardId(giftCardId);
    if (!purchase) return undefined;
    let classCategoryName: string | undefined;
    if (purchase.classCategoryId) {
      classCategoryName = (
        await ClassCategoryRepository.findById(purchase.classCategoryId)
      )?.name;
    }
    return {
      ...purchase,
      createdAt: purchase.createdAt.toISOString(),
      classCategoryName,
    };
  } catch (error) {
    console.error('[getGiftCard] could not read the purchase record', error);
    return undefined;
  }
}

/** One card and its history. */
export async function getGiftCard(
  data: GetGiftCardRequest,
  _context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<GetGiftCardResponse> {
  if (!data?.id) throwInvalidArgument('Gift card id is required');
  const giftCards = new Square(secrets, strings).giftCardsService;

  const card = await giftCards.getGiftCard(data.id);
  if (!card) throwNotFound('Gift card', data.id);

  // Square defaults an activity search to the last year; a card can be older.
  const [activities, purchase] = await Promise.all([
    giftCards.listActivities({
      giftCardId: data.id,
      beginTime: new Date(card.createdAt || 0),
    }),
    readPurchase(data.id),
  ]);
  return purchase ? { card, activities, purchase } : { card, activities };
}

/**
 * The full code, for printing on a certificate. Logged with who asked, never
 * with the code itself, so the logs say who looked without becoming a list of
 * spendable codes.
 */
export async function revealGiftCardCode(
  data: RevealGiftCardCodeRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<RevealGiftCardCodeResponse> {
  if (!data?.id) throwInvalidArgument('Gift card id is required');
  const code = await new Square(secrets, strings).giftCardsService.getGiftCardCode(
    data.id
  );
  if (!code) throwNotFound('Gift card', data.id);

  console.log(
    JSON.stringify({
      event: 'gift_card_code_revealed',
      giftCardId: data.id,
      uid: context.uid ?? null,
    })
  );
  return { code };
}
