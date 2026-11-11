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
 * - POST /v2/gift-cards          (create a digital card, PENDING, no money; a chosen
 *                                 `gan` with `gan_source: OTHER` must be unique (#332))
 * - POST /v2/gift-cards/activities (REDEEM part of a balance; ACTIVATE against a GIFT_CARD order line,
 *                                   or, with no order, with `amount_money` and
 *                                   `buyer_payment_instrument_ids` (#310);
 *                                   ADJUST_DECREMENT up to the balance and
 *                                   DEACTIVATE (#332))
 * - GET  /v2/gift-cards/activities  (history, newest first; by card and/or type)
 * - GET  /v2/gift-cards          (every card, newest first, one page; or one customer's)
 * - GET  /v2/gift-cards/:id
 * - POST /v2/orders/search       (gift card orders by customer, #332)
 * - POST /v2/customers/search    (fuzzy email/phone over customers seeded here, #332;
 *                                 anything else passes on to square.ts)
 * - GET  /v2/customers           (customers seeded here, newest first, #332)
 * - GET  /v2/customers/:id       (customers seeded here, #332)
 * - POST /_mock/gift-cards/fail-next-activation  (the next activity of any type fails)
 * - POST /_mock/gift-cards/fail-next-activity    (the next activity of one `type` fails)
 * - POST /_mock/gift-cards/customers             (seed customers)
 * - POST /_mock/gift-cards/register-sale         (what the Square register does when it
 *                                                 sells a printed certificate, #332)
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
/** When set, the next activity of this type fails with the code. */
let failNextOfType: { type: string; code: string } | null = null;
/** Customers seeded for the gift card tests (#332), in Square wire shape. */
const giftCardCustomers = new Map<string, Wire>();

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

    const requested = (body['gift_card'] ?? {}) as Wire;
    const type = requested['type'];
    if (type !== 'DIGITAL') {
      return error(400, 'INVALID_VALUE', 'Only DIGITAL gift cards are mocked');
    }
    const chosen = requested['gan'] as string | undefined;
    if (chosen !== undefined) {
      // A code the seller chooses (#332): 8 to 20 letters and digits, unique
      // on the account. Square's wording for a clash is not documented; the
      // mock says "already exists", which the service matches.
      if (requested['gan_source'] !== 'OTHER') {
        return error(400, 'INVALID_VALUE', 'gan requires gan_source OTHER');
      }
      if (!/^[A-Za-z\d]{8,20}$/.test(chosen)) {
        return error(400, 'INVALID_VALUE', 'gan must be 8 to 20 letters and digits');
      }
      if ([...giftCards.values()].some((c) => c['gan'] === chosen)) {
        return error(400, 'INVALID_VALUE', 'A gift card with this GAN already exists');
      }
    }
    giftCardCounter++;
    const card: Wire = {
      id: `gftc:mock-${giftCardCounter}`,
      type: 'DIGITAL',
      gan_source: chosen ? 'OTHER' : 'SQUARE',
      state: 'PENDING',
      balance_money: { amount: 0, currency: 'USD' },
      // 16 digits, like a real Square GAN; the last 4 differ per card.
      gan: chosen ?? `77833200${String(giftCardCounter).padStart(8, '0')}`,
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
    if (failNextOfType && failNextOfType.type === activity['type']) {
      const { code } = failNextOfType;
      failNextOfType = null;
      return error(400, code, `Mock ${String(activity['type'])} failure: ${code}`);
    }
    if (!MOCKED_ACTIVITY_TYPES.has(activity['type'] as string)) {
      return error(400, 'INVALID_VALUE', `Only ${[...MOCKED_ACTIVITY_TYPES].join(', ')} are mocked`);
    }
    const card = giftCards.get(activity['gift_card_id'] as string);
    if (!card) return error(404, 'NOT_FOUND', 'Gift card not found');
    if (activity['type'] === 'ADJUST_DECREMENT' || activity['type'] === 'DEACTIVATE') {
      const result = adjustOrDeactivate(card, activity);
      if ('status' in result) return result;
      if (key) activitiesByKey.set(key, result.activity);
      activities.push(result.activity);
      return { status: 200, body: { gift_card_activity: result.activity } };
    }
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

  // Every card, newest first, in one page (#314: the admin page's list).
  server.get('/v2/gift-cards', (req) => {
    const customerId = req.query['customer_id'];
    const cards = [...giftCards.values()]
      .filter(
        (c) => !customerId || ((c['customer_ids'] ?? []) as string[]).includes(customerId)
      )
      .reverse();
    return { status: 200, body: { gift_cards: cards } };
  });

  // Registered before `/v2/gift-cards/:id`, which would otherwise match it.
  server.get('/v2/gift-cards/activities', (req) => {
    const giftCardId = req.query['gift_card_id'];
    const type = req.query['type'];
    const matching = activities
      .filter((a) => !giftCardId || a['gift_card_id'] === giftCardId)
      .filter((a) => !type || a['type'] === type)
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

  server.post('/_mock/gift-cards/fail-next-activity', (req) => {
    const body = (req.body ?? {}) as Wire;
    failNextOfType = {
      type: String(body['type']),
      code: (body['code'] as string | undefined) ?? 'INTERNAL_SERVER_ERROR',
    };
    return { status: 200, body: { ok: true } };
  });

  registerCustomerRoutes(server);

  server.get('/_mock/gift-cards', () => ({
    status: 200,
    body: { giftCards: [...giftCards.values()] },
  }));
}

const MOCKED_ACTIVITY_TYPES: ReadonlySet<string> = new Set([
  'ACTIVATE',
  'REDEEM',
  'ADJUST_DECREMENT',
  'DEACTIVATE',
]);

/**
 * `ADJUST_DECREMENT` (no more than the balance, active cards only) and
 * `DEACTIVATE` (for good, reason `SUSPICIOUS_ACTIVITY` only), as Square
 * does them (#332).
 */
function adjustOrDeactivate(
  card: Wire,
  activity: Wire
): { activity: Wire } | { status: number; body: unknown } {
  if (card['state'] !== 'ACTIVE') {
    return error(400, 'INVALID_GIFT_CARD_STATE', 'Gift card is not active');
  }
  activityCounter++;
  const base: Wire = {
    id: `gcact-mock-${activityCounter}`,
    type: activity['type'],
    location_id: activity['location_id'],
    gift_card_id: card['id'],
    gift_card_gan: card['gan'],
    created_at: new Date().toISOString(),
  };
  if (activity['type'] === 'DEACTIVATE') {
    const details = (activity['deactivate_activity_details'] ?? {}) as Wire;
    if (!details['reason']) return error(400, 'MISSING_REQUIRED_PARAMETER', 'reason is required');
    // Square accepts only SUSPICIOUS_ACTIVITY from an app; UNKNOWN_REASON and
    // CHARGEBACK_DEACTIVATE are read-only and refused with this exact detail.
    if (details['reason'] !== 'SUSPICIOUS_ACTIVITY') {
      activityCounter--;
      return error(400, 'BAD_REQUEST', 'Reason is not valid for creating a deactivate giftcard activity');
    }
    card['state'] = 'DEACTIVATED';
    return {
      activity: {
        ...base,
        gift_card_balance_money: card['balance_money'],
        deactivate_activity_details: { reason: details['reason'] },
      },
    };
  }
  const details = (activity['adjust_decrement_activity_details'] ?? {}) as Wire;
  const amount = amountOf(details['amount_money']);
  const balance = amountOf(card['balance_money']);
  if (!details['reason']) return error(400, 'MISSING_REQUIRED_PARAMETER', 'reason is required');
  if (amount <= 0 || amount > balance) {
    activityCounter--;
    return error(400, 'INSUFFICIENT_FUNDS', 'Not enough on the card');
  }
  card['balance_money'] = { amount: balance - amount, currency: 'USD' };
  return {
    activity: {
      ...base,
      gift_card_balance_money: card['balance_money'],
      adjust_decrement_activity_details: {
        amount_money: { amount, currency: 'USD' },
        reason: details['reason'],
      },
    },
  };
}

/**
 * Customers for the gift card tests (#332): seeded, searched by fuzzy email
 * or phone, listed, read, and a register sale that loads a printed
 * certificate for one of them.
 */
function registerCustomerRoutes(server: SquareMockServer): void {
  // { customers: [{ id, given_name, family_name, email_address, phone_number }] }
  server.post('/_mock/gift-cards/customers', (req) => {
    const body = (req.body ?? {}) as { customers?: Wire[] };
    for (const customer of body.customers ?? []) {
      giftCardCustomers.set(customer['id'] as string, {
        created_at: new Date().toISOString(),
        ...customer,
      });
    }
    return { status: 200, body: { ok: true } };
  });

  // The register sells a printed certificate: Check Balance on its code, load
  // the amount, add the customer, charge. Square makes a paid order with a
  // GIFT_CARD line and the customer on it, then activates the card against it.
  // { gan, amount, customer_id?, link_customer? }
  server.post('/_mock/gift-cards/register-sale', (req) => {
    const body = (req.body ?? {}) as Wire;
    const card = [...giftCards.values()].find((c) => c['gan'] === body['gan']);
    if (!card) return error(404, 'NOT_FOUND', 'No card with that code');
    if (card['state'] !== 'PENDING') {
      return error(400, 'INVALID_GIFT_CARD_STATE', 'Gift card is already active');
    }
    const amount = Number(body['amount']);
    giftCardOrderCounter++;
    const orderId = `mock-gc-register-order-${giftCardOrderCounter}`;
    const lineUid = `${orderId}-line-1`;
    giftCardOrders.set(orderId, {
      id: orderId,
      location_id: 'mock-location',
      customer_id: body['customer_id'],
      state: 'COMPLETED',
      line_items: [
        {
          uid: lineUid,
          name: 'Gift Card',
          quantity: '1',
          item_type: 'GIFT_CARD',
          base_price_money: { amount, currency: 'USD' },
          total_money: { amount, currency: 'USD' },
          total_tax_money: { amount: 0, currency: 'USD' },
        },
      ],
      total_money: { amount, currency: 'USD' },
      total_tax_money: { amount: 0, currency: 'USD' },
      created_at: new Date().toISOString(),
    });
    card['state'] = 'ACTIVE';
    card['balance_money'] = { amount, currency: 'USD' };
    if (body['link_customer'] && body['customer_id']) {
      card['customer_ids'] = [body['customer_id']];
    }
    activityCounter++;
    const created: Wire = {
      id: `gcact-mock-${activityCounter}`,
      type: 'ACTIVATE',
      location_id: 'mock-location',
      gift_card_id: card['id'],
      gift_card_gan: card['gan'],
      gift_card_balance_money: { amount, currency: 'USD' },
      activate_activity_details: {
        amount_money: { amount, currency: 'USD' },
        order_id: orderId,
        line_item_uid: lineUid,
      },
      created_at: new Date().toISOString(),
    };
    activities.push(created);
    return { status: 200, body: { order_id: orderId, gift_card_activity: created } };
  });

  server.post('/v2/orders/search', (req) => {
    const body = (req.body ?? {}) as Wire;
    const filter = (((body['query'] ?? {}) as Wire)['filter'] ?? {}) as Wire;
    const customerIds = ((filter['customer_filter'] ?? {}) as Wire)['customer_ids'] as
      | string[]
      | undefined;
    if (!customerIds) return undefined;
    const matching = [...giftCardOrders.values()].filter((o) =>
      customerIds.includes(o['customer_id'] as string)
    );
    return {
      status: 200,
      body: { order_entries: matching.map((o) => ({ order_id: o['id'] })) },
    };
  });

  server.post('/v2/customers/search', (req) => {
    const filter = ((((req.body ?? {}) as Wire)['query'] ?? {}) as Wire)['filter'] as
      | Wire
      | undefined;
    const email = ((filter?.['email_address'] ?? {}) as Wire)['fuzzy'] as string | undefined;
    const phone = ((filter?.['phone_number'] ?? {}) as Wire)['fuzzy'] as string | undefined;
    // Exact email lookups (the craft club upsert) stay with square.ts.
    if (email === undefined && phone === undefined) return undefined;
    const customers = [...giftCardCustomers.values()].filter((c) => {
      if (email !== undefined) {
        return String(c['email_address'] ?? '').toLowerCase().includes(email.toLowerCase());
      }
      return String(c['phone_number'] ?? '').replace(/\D/g, '').includes(phone as string);
    });
    return { status: 200, body: { customers } };
  });

  server.get('/v2/customers', () => ({
    status: 200,
    body: { customers: [...giftCardCustomers.values()].reverse() },
  }));

  server.get('/v2/customers/:customerId', (req) => {
    const customer = giftCardCustomers.get(req.params['customerId']);
    return customer ? { status: 200, body: { customer } } : undefined;
  });
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
  failNextOfType = null;
  giftCardCustomers.clear();
}
