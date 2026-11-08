/**
 * Square gift card mock routes (#300).
 *
 * Kept out of `square.ts` so gift card work does not collide with the rest of
 * the Square mock. Registered BEFORE `registerSquareRoutes`, and on shared
 * paths each handler answers only what is its own, returning `undefined` to
 * pass anything else on (see `SquareMockServer`'s route handler type).
 *
 * - POST /v2/orders              (only orders with a GIFT_CARD line)
 * - GET  /v2/orders/:orderId     (only those orders)
 * - POST /v2/gift-cards          (create a digital card, PENDING, no money)
 * - POST /v2/gift-cards/activities (REDEEM part of a balance; ACTIVATE against a GIFT_CARD order line,
 *                                   or, with no order, with `amount_money` and
 *                                   `buyer_payment_instrument_ids` (#310))
 * - GET  /v2/gift-cards/activities  (one card's history, newest first)
 * - GET  /v2/gift-cards/:id
 * - POST /_mock/gift-cards/fail-next-activation
 * - GET  /_mock/gift-cards       (every card, for test assertions)
 *
 * Like Square, the order echoes each line with a `uid`, computes its total
 * from the lines (a gift card line carries no tax), and an activation must
 * name an order and a `GIFT_CARD` line that exist. The amount loaded is that
 * line's price, never a number the caller passes. An activation without an
 * order is Square's path for value sold outside its Orders API: it must carry
 * a positive `amount_money` and at least one buyer payment instrument id, and
 * must not also name an order.
 */
import type { SquareMockServer } from '../square-mock-server';

type Wire = Record<string, unknown>;

let giftCardOrderCounter = 0;
let giftCardCounter = 0;
let activityCounter = 0;
/** Orders with a GIFT_CARD line, in Square wire shape. */
const giftCardOrders = new Map<string, Wire>();
const giftCardOrdersByKey = new Map<string, Wire>();
const giftCards = new Map<string, Wire>();
const giftCardsByKey = new Map<string, Wire>();
const activitiesByKey = new Map<string, Wire>();
/** Every activity, oldest first, for the history list. */
const activities: Wire[] = [];
/** When set, the next activation fails with this error code. */
let failNextActivation: string | null = null;

function error(status: number, code: string, detail: string) {
  return {
    status,
    body: { errors: [{ category: 'INVALID_REQUEST_ERROR', code, detail }] },
  };
}

function amountOf(money: unknown): number {
  const amount = (money as Wire | undefined)?.['amount'];
  return Number(amount ?? 0);
}

export function registerGiftCardRoutes(server: SquareMockServer): void {
  // `/_mock/reset` is answered by square.ts; clear this file's state first.
  server.post('/_mock/reset', () => {
    resetGiftCardState();
    return undefined;
  });

  server.post('/v2/orders', (req) => {
    const body = (req.body ?? {}) as Wire;
    const order = (body['order'] ?? {}) as Wire;
    const lines = (order['line_items'] ?? []) as Wire[];
    if (!lines.some((line) => line['item_type'] === 'GIFT_CARD')) return undefined;

    const key = body['idempotency_key'] as string | undefined;
    const existing = key ? giftCardOrdersByKey.get(key) : undefined;
    if (existing) return { status: 200, body: { order: existing } };

    giftCardOrderCounter++;
    const id = `mock-gc-order-${giftCardOrderCounter}`;
    let total = 0;
    const lineItems = lines.map((line, i) => {
      const quantity = Number(line['quantity'] ?? '1');
      const lineTotal = amountOf(line['base_price_money']) * quantity;
      total += lineTotal;
      return {
        ...line,
        uid: `${id}-line-${i + 1}`,
        item_type: line['item_type'] ?? 'ITEM',
        gross_sales_money: { amount: lineTotal, currency: 'USD' },
        total_tax_money: { amount: 0, currency: 'USD' },
        total_money: { amount: lineTotal, currency: 'USD' },
      };
    });
    const created: Wire = {
      id,
      location_id: order['location_id'] ?? 'mock-location',
      reference_id: order['reference_id'],
      state: 'OPEN',
      line_items: lineItems,
      total_money: { amount: total, currency: 'USD' },
      total_tax_money: { amount: 0, currency: 'USD' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    giftCardOrders.set(id, created);
    if (key) giftCardOrdersByKey.set(key, created);
    return { status: 200, body: { order: created } };
  });

  server.get('/v2/orders/:orderId', (req) => {
    const order = giftCardOrders.get(req.params['orderId']);
    return order ? { status: 200, body: { order } } : undefined;
  });

  server.post('/v2/gift-cards', (req) => {
    const body = (req.body ?? {}) as Wire;
    const key = body['idempotency_key'] as string | undefined;
    const existing = key ? giftCardsByKey.get(key) : undefined;
    if (existing) return { status: 200, body: { gift_card: existing } };

    const type = ((body['gift_card'] ?? {}) as Wire)['type'];
    if (type !== 'DIGITAL') {
      return error(400, 'INVALID_VALUE', 'Only DIGITAL gift cards are mocked');
    }
    giftCardCounter++;
    const card: Wire = {
      id: `gftc:mock-${giftCardCounter}`,
      type: 'DIGITAL',
      gan_source: 'SQUARE',
      state: 'PENDING',
      balance_money: { amount: 0, currency: 'USD' },
      // 16 digits, like a real Square GAN; the last 4 differ per card.
      gan: `77833200${String(giftCardCounter).padStart(8, '0')}`,
      created_at: new Date().toISOString(),
    };
    giftCards.set(card['id'] as string, card);
    if (key) giftCardsByKey.set(key, card);
    return { status: 200, body: { gift_card: card } };
  });

  server.post('/v2/gift-cards/activities', (req) => {
    const body = (req.body ?? {}) as Wire;
    const key = body['idempotency_key'] as string | undefined;
    const existing = key ? activitiesByKey.get(key) : undefined;
    if (existing) return { status: 200, body: { gift_card_activity: existing } };

    if (failNextActivation) {
      const code = failNextActivation;
      failNextActivation = null;
      return error(400, code, `Mock activation failure: ${code}`);
    }

    const activity = (body['gift_card_activity'] ?? {}) as Wire;
    if (activity['type'] !== 'ACTIVATE' && activity['type'] !== 'REDEEM') {
      return error(400, 'INVALID_VALUE', 'Only ACTIVATE and REDEEM are mocked');
    }
    const card = giftCards.get(activity['gift_card_id'] as string);
    if (!card) return error(404, 'NOT_FOUND', 'Gift card not found');
    if (activity['type'] === 'REDEEM') {
      // Spending part of a card, so a test can tell what was loaded from
      // what is left.
      if (card['state'] !== 'ACTIVE') {
        return error(400, 'INVALID_GIFT_CARD_STATE', 'Gift card is not active');
      }
      const redeem = (activity['redeem_activity_details'] ?? {}) as Wire;
      const spent = amountOf(redeem['amount_money']);
      const balance = amountOf(card['balance_money']);
      if (spent <= 0 || spent > balance) {
        return error(400, 'INSUFFICIENT_FUNDS', 'Not enough on the card');
      }
      card['balance_money'] = { amount: balance - spent, currency: 'USD' };
      activityCounter++;
      const redeemed: Wire = {
        id: `gcact-mock-${activityCounter}`,
        type: 'REDEEM',
        location_id: activity['location_id'],
        gift_card_id: card['id'],
        gift_card_gan: card['gan'],
        gift_card_balance_money: card['balance_money'],
        redeem_activity_details: { amount_money: { amount: spent, currency: 'USD' } },
        created_at: new Date().toISOString(),
      };
      if (key) activitiesByKey.set(key, redeemed);
      activities.push(redeemed);
      return { status: 200, body: { gift_card_activity: redeemed } };
    }
    if (card['state'] !== 'PENDING') {
      return error(400, 'INVALID_GIFT_CARD_STATE', 'Gift card is already active');
    }
    const details = (activity['activate_activity_details'] ?? {}) as Wire;
    let amount: number;
    let activateDetails: Wire;
    if (details['order_id'] === undefined && details['line_item_uid'] === undefined) {
      // Value from outside Square Orders (#310): the caller names the amount.
      amount = amountOf(details['amount_money']);
      if (!Number.isInteger(amount) || amount <= 0) {
        return error(400, 'INVALID_VALUE', 'amount_money is required without an order');
      }
      const instruments = details['buyer_payment_instrument_ids'];
      if (!Array.isArray(instruments) || instruments.length === 0) {
        return error(
          400,
          'MISSING_REQUIRED_PARAMETER',
          'buyer_payment_instrument_ids is required without an order'
        );
      }
      activateDetails = {
        amount_money: { amount, currency: 'USD' },
        reference_id: details['reference_id'],
        buyer_payment_instrument_ids: instruments,
      };
    } else {
      if (details['amount_money'] !== undefined) {
        return error(400, 'INVALID_VALUE', 'amount_money is taken from the order line');
      }
      const order = giftCardOrders.get(details['order_id'] as string);
      if (!order) return error(404, 'NOT_FOUND', 'Order not found');
      const line = ((order['line_items'] ?? []) as Wire[]).find(
        (l) => l['uid'] === details['line_item_uid'] && l['item_type'] === 'GIFT_CARD'
      );
      if (!line) {
        return error(400, 'INVALID_VALUE', 'line_item_uid is not a GIFT_CARD line on the order');
      }
      amount = amountOf(line['base_price_money']);
      activateDetails = {
        amount_money: { amount, currency: 'USD' },
        order_id: order['id'],
        line_item_uid: line['uid'],
      };
    }

    card['state'] = 'ACTIVE';
    card['balance_money'] = { amount, currency: 'USD' };
    activityCounter++;
    const created: Wire = {
      id: `gcact-mock-${activityCounter}`,
      type: 'ACTIVATE',
      location_id: activity['location_id'],
      gift_card_id: card['id'],
      gift_card_gan: card['gan'],
      gift_card_balance_money: { amount, currency: 'USD' },
      activate_activity_details: activateDetails,
      created_at: new Date().toISOString(),
    };
    if (key) activitiesByKey.set(key, created);
    activities.push(created);
    return { status: 200, body: { gift_card_activity: created } };
  });

  // Registered before `/v2/gift-cards/:id`, which would otherwise match it.
  server.get('/v2/gift-cards/activities', (req) => {
    const giftCardId = req.query['gift_card_id'];
    const matching = activities
      .filter((a) => !giftCardId || a['gift_card_id'] === giftCardId)
      .slice()
      .reverse();
    return { status: 200, body: { gift_card_activities: matching } };
  });

  server.get('/v2/gift-cards/:id', (req) => {
    const card = giftCards.get(req.params['id']);
    return card
      ? { status: 200, body: { gift_card: card } }
      : error(404, 'NOT_FOUND', 'Gift card not found');
  });

  server.post('/_mock/gift-cards/fail-next-activation', (req) => {
    const body = (req.body ?? {}) as Wire;
    failNextActivation = (body['code'] as string | undefined) ?? 'INTERNAL_SERVER_ERROR';
    return { status: 200, body: { ok: true } };
  });

  server.get('/_mock/gift-cards', () => ({
    status: 200,
    body: { giftCards: [...giftCards.values()] },
  }));
}

export function resetGiftCardState(): void {
  giftCardOrderCounter = 0;
  giftCardCounter = 0;
  activityCounter = 0;
  giftCardOrders.clear();
  giftCardOrdersByKey.clear();
  giftCards.clear();
  giftCardsByKey.clear();
  activitiesByKey.clear();
  activities.length = 0;
  failNextActivation = null;
}
