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
import {
  type GiftCardListItem,
  type GiftCardPurchase,
  startOfMonthInTimeZone,
  summarizeGiftCards,
} from '@maple/ts/domain';
import type {
  GiftCardPurchaseDetails,
  GetGiftCardRequest,
  GetGiftCardResponse,
  GetGiftCardsRequest,
  GetGiftCardsResponse,
  RevealGiftCardCodeRequest,
  RevealGiftCardCodeResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Free cards, printed stock and replacements, which change the totals and the
 * list labels (#314, #332). One query, not one per card. A failed read leaves the page working
 * with every card counted as a sale, rather than failing it.
 */
async function readRecordsForTotals(): Promise<GiftCardPurchase[]> {
  try {
    return await GiftCardPurchaseRepository.findBySources(['issued', 'stock', 'replacement']);
  } catch (error) {
    console.error('[getGiftCards] could not read gift card records', error);
    return [];
  }
}

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

  const [cards, activitiesThisMonth, records] = await Promise.all([
    giftCards.listGiftCards(),
    giftCards.listActivities({ beginTime: monthStart, endTime: now }),
    readRecordsForTotals(),
  ]);

  const recordById = new Map(records.map((r) => [r.giftCardId, r]));
  const listed: GiftCardListItem[] = cards.map((card) => {
    const record = recordById.get(card.id);
    if (!record?.source) return card;
    return {
      ...card,
      source: record.source,
      ...(record.batchId ? { batchId: record.batchId } : {}),
    };
  });

  return {
    totals: summarizeGiftCards(cards, activitiesThisMonth, records),
    cards: listed,
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

  const [activities, purchase] = await Promise.all([
    giftCards.listCardHistory(data.id, card.createdAt),
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
