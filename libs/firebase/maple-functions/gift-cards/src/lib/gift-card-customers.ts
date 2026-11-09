/**
 * Who is on a gift card (#332), read live from Square for the admin.
 *
 * - `getGiftCardBuyer`: who bought a card at the register. The card's first
 *   activation (or, failing that, its first load) names the Square order that
 *   sold it; the order names the customer Katie added to the sale.
 * - `searchGiftCardsByCustomer`: find a customer's cards by their name, email
 *   or phone.
 *
 * Both are admin only. Customer details are read from Square each time and
 * never stored or logged; the logs carry ids and counts only.
 */
import {
  type FunctionContext,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { GiftCardPurchaseRepository } from '@maple/firebase/database';
import {
  type FoundSquareCustomer,
  Square,
  type SquareSecrets,
  type SquareStrings,
} from '@maple/firebase/square';
import {
  customerNameMatches,
  GIFT_CARD_CUSTOMER_MATCH_LIMIT,
  GIFT_CARD_CUSTOMER_QUERY_MAX_LENGTH,
  GIFT_CARD_NAME_SEARCH_MAX_CUSTOMERS,
  GIFT_CARD_SALE_SEARCH_YEARS,
  type GiftCardActivityEntry,
  type GiftCardListItem,
  type GiftCardSummary,
  giftCardSearchKind,
} from '@maple/ts/domain';
import type {
  GetGiftCardBuyerRequest,
  GetGiftCardBuyerResponse,
  GiftCardCustomer,
  GiftCardCustomerMatch,
  SearchGiftCardsByCustomerRequest,
  SearchGiftCardsByCustomerResponse,
} from '@maple/ts/firebase/api-types';

export function toGiftCardCustomer(customer: FoundSquareCustomer): GiftCardCustomer {
  const name = [customer.givenName, customer.familyName].filter(Boolean).join(' ');
  return {
    id: customer.id,
    ...(name ? { name } : {}),
    ...(customer.emailAddress ? { email: customer.emailAddress } : {}),
    ...(customer.phoneNumber ? { phone: customer.phoneNumber } : {}),
  };
}

/**
 * The activity that sold the card at a register: its activation when an
 * order made it, else the first load that came with an order. Undefined for
 * a card no order ever loaded (a free card, a replacement, or one still
 * waiting to be sold).
 */
export function saleActivity(
  history: readonly GiftCardActivityEntry[]
): GiftCardActivityEntry | undefined {
  const oldestFirst = [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    oldestFirst.find((a) => a.type === 'activate' && a.orderId) ??
    oldestFirst.find((a) => a.type === 'load' && a.orderId)
  );
}

/** Who bought a card at the register, and who Square links to it. */
export async function getGiftCardBuyer(
  data: GetGiftCardBuyerRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<GetGiftCardBuyerResponse> {
  const id = typeof data?.id === 'string' ? data.id.trim() : '';
  if (!id) throwInvalidArgument('Gift card id is required');

  const square = new Square(secrets, strings);
  const card = await square.giftCardsService.getGiftCard(id);
  if (!card) throwNotFound('Gift card', id);

  const [history, linkedIds] = await Promise.all([
    square.giftCardsService.listCardHistory(id, card.createdAt),
    square.giftCardsService.getLinkedCustomerIds(id),
  ]);

  const response: GetGiftCardBuyerResponse = { linkedCustomers: [] };
  const sold = saleActivity(history);
  if (sold?.orderId) {
    const order = await square.ordersService.getOrder(sold.orderId);
    const customer = order.customerId
      ? await square.customersService.find(order.customerId)
      : undefined;
    response.sale = {
      soldAt: sold.createdAt,
      orderId: sold.orderId,
      ...(customer ? { customer: toGiftCardCustomer(customer) } : {}),
    };
  }

  const linked = await Promise.all(
    linkedIds.map((customerId) => square.customersService.find(customerId))
  );
  response.linkedCustomers = linked
    .filter((c): c is FoundSquareCustomer => c !== undefined)
    .map(toGiftCardCustomer);

  console.log(
    JSON.stringify({
      event: 'gift_card_buyer_viewed',
      giftCardId: id,
      hasSale: Boolean(response.sale),
      hasCustomer: Boolean(response.sale?.customer),
      linkedCount: response.linkedCustomers.length,
      uid: context.uid ?? null,
    })
  );
  return response;
}

/** The first of `since` years ago: the start of the register-sale search. */
export function saleSearchStart(now: Date): Date {
  const since = new Date(now);
  since.setUTCFullYear(since.getUTCFullYear() - GIFT_CARD_SALE_SEARCH_YEARS);
  return since;
}

/**
 * A customer's cards by name, email or phone.
 *
 * 1. Square customers matching the query: an email or phone with Square's
 *    fuzzy search, a name against the most recent
 *    `GIFT_CARD_NAME_SEARCH_MAX_CUSTOMERS` customers (Square has no name
 *    search). At most `GIFT_CARD_CUSTOMER_MATCH_LIMIT` customers.
 * 2. Their cards: (a) every card Square links to them, however old, and
 *    (b) every card an order of theirs activated or loaded in the last
 *    `GIFT_CARD_SALE_SEARCH_YEARS` years: we list those years' gift card
 *    activations and loads, and keep the ones whose order is one of theirs.
 */
export async function searchGiftCardsByCustomer(
  data: SearchGiftCardsByCustomerRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings,
  now: Date = new Date()
): Promise<SearchGiftCardsByCustomerResponse> {
  const query = typeof data?.query === 'string' ? data.query.trim() : '';
  const kind = giftCardSearchKind(query);
  if (kind === 'none' || kind === 'last4') {
    throwInvalidArgument('Type a name, an email address or a phone number');
  }
  if (query.length > GIFT_CARD_CUSTOMER_QUERY_MAX_LENGTH) {
    throwInvalidArgument(`Use ${GIFT_CARD_CUSTOMER_QUERY_MAX_LENGTH} characters or fewer`);
  }
  const searchedBy = kind;

  const square = new Square(secrets, strings);
  let customers: FoundSquareCustomer[];
  if (searchedBy === 'name') {
    customers = await square.customersService.findByName(
      (name) => customerNameMatches(name, query),
      GIFT_CARD_CUSTOMER_MATCH_LIMIT,
      GIFT_CARD_NAME_SEARCH_MAX_CUSTOMERS
    );
  } else {
    const value = searchedBy === 'phone' ? query.replace(/\D/g, '') : query;
    customers = (
      await square.customersService.searchByContact(
        searchedBy,
        value,
        GIFT_CARD_CUSTOMER_MATCH_LIMIT
      )
    ).slice(0, GIFT_CARD_CUSTOMER_MATCH_LIMIT);
  }

  const since = saleSearchStart(now);
  const response: SearchGiftCardsByCustomerResponse = {
    matches: [],
    cards: [],
    searchedSince: since.toISOString(),
    searchedBy,
  };
  if (customers.length === 0) {
    logSearch(searchedBy, 0, 0, context);
    return response;
  }

  const giftCards = square.giftCardsService;
  const customerIds = customers.map((c) => c.id);
  const [linkedLists, orderIdsByCustomer, loads] = await Promise.all([
    Promise.all(customerIds.map((id) => giftCards.listGiftCardsForCustomer(id))),
    Promise.all(
      customerIds.map((customerId) =>
        square.ordersService.searchOrderIdsForCustomers({
          locationId: square.locationId,
          customerIds: [customerId],
          since,
          until: now,
        })
      )
    ),
    Promise.all([
      giftCards.listActivitiesSince(since, 'ACTIVATE', now),
      giftCards.listActivitiesSince(since, 'LOAD', now),
    ]).then((lists) => lists.flat()),
  ]);

  const cardById = new Map<string, GiftCardSummary>();
  for (const list of linkedLists) {
    for (const card of list) cardById.set(card.id, card);
  }

  const matches: GiftCardCustomerMatch[] = customers.map((customer, i) => {
    const ids = new Set(linkedLists[i].map((c) => c.id));
    const theirOrders = orderIdsByCustomer[i];
    for (const activity of loads) {
      if (activity.orderId && theirOrders.has(activity.orderId)) ids.add(activity.giftCardId);
    }
    return { customer: toGiftCardCustomer(customer), giftCardIds: [...ids] };
  });

  // Cards found only through an order are read one by one.
  const missing = [...new Set(matches.flatMap((m) => m.giftCardIds))].filter(
    (id) => !cardById.has(id)
  );
  const read = await Promise.all(missing.map((id) => giftCards.getGiftCard(id)));
  for (const card of read) if (card) cardById.set(card.id, card);

  response.matches = matches.map((m) => ({
    ...m,
    giftCardIds: m.giftCardIds.filter((id) => cardById.has(id)),
  }));
  response.cards = await labelCards([...cardById.values()]);
  logSearch(searchedBy, customers.length, response.cards.length, context);
  return response;
}

/** The cards, newest first, with how our records say each came about. */
async function labelCards(cards: GiftCardSummary[]): Promise<GiftCardListItem[]> {
  const records = await Promise.all(
    cards.map((card) =>
      GiftCardPurchaseRepository.findByGiftCardId(card.id).catch(() => undefined)
    )
  );
  return cards
    .map((card, i): GiftCardListItem => {
      const record = records[i];
      if (!record?.source) return card;
      return {
        ...card,
        source: record.source,
        ...(record.batchId ? { batchId: record.batchId } : {}),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function logSearch(
  searchedBy: string,
  customerCount: number,
  cardCount: number,
  context: FunctionContext
): void {
  // Never the query itself: it is a customer's name, email or phone.
  console.log(
    JSON.stringify({
      event: 'gift_card_customer_search',
      searchedBy,
      customerCount,
      cardCount,
      uid: context.uid ?? null,
    })
  );
}
