/**
 * Square mock routes for paying with a gift card (#301).
 *
 * Registered BEFORE the general routes in `square.ts`, and hands anything it
 * does not own back to them (a route returning `null` falls through):
 *
 * - POST /v2/orders                    orders with real totals (discounts, tax)
 * - POST /v2/orders/:orderId/pay       completes the order's authorized payments
 * - POST /v2/gift-cards/from-nonce     the card behind a seeded gift card token
 * - POST /v2/payments                  a gift card payment, with balance holds
 *                                      and partial authorization (cards fall through)
 * - GET  /v2/payments/:paymentId       a gift card payment (cards fall through)
 * - POST /v2/payments/:paymentId/cancel  voids an authorization; a gift card
 *                                      gets its held amount back
 * - POST /v2/payments/cancel           cancel by idempotency key
 * - POST /v2/refunds                   a gift card refund goes back onto the card
 *                                      (cards fall through)
 *
 * Test controls:
 * - POST /_mock/gift-cards             seed cards: { cards: [{ nonce, id, gan,
 *                                      balanceCents, state? }] }
 * - GET  /_mock/gift-cards/:giftCardId the card's balance now, for assertions
 *
 * It lies the way Square does where that matters: a gift card payment is
 * refused unless it is `autocomplete: false` with partial authorization (the
 * walkthrough says both are required), Square approves only what the card
 * holds, and a held amount leaves the balance until it is cancelled.
 */
import { SquareMockServer } from '../square-mock-server';

interface MockGiftCard {
  id: string;
  gan: string;
  state: string;
  balanceCents: number;
}

/** Seeded gift cards by token, and by id. */
const cardsByNonce = new Map<string, MockGiftCard>();
const cardsById = new Map<string, MockGiftCard>();
/** Gift card payments by id, Square wire shape. */
const giftCardPayments = new Map<string, Record<string, unknown>>();
const giftCardPaymentsByKey = new Map<string, Record<string, unknown>>();
/** Orders created through POST /v2/orders, Square wire shape. */
const orders = new Map<string, Record<string, unknown>>();
const ordersByKey = new Map<string, Record<string, unknown>>();
let giftPaymentCounter = 0;
let realOrderCounter = 0;
let giftRefundCounter = 0;

type Body = Record<string, unknown>;

function field<T>(body: Body, snake: string, camel: string): T | undefined {
  return (body[snake] ?? body[camel]) as T | undefined;
}

function money(amount: number): { amount: number; currency: string } {
  return { amount, currency: 'USD' };
}

function squareError(status: number, code: string, detail: string) {
  return {
    status,
    body: {
      errors: [{ category: 'INVALID_REQUEST_ERROR', code, detail }],
    },
  };
}

/** Totals the way Square works them out: fixed discounts first, then tax. */
function priceOrder(order: Body): {
  gross: number;
  discount: number;
  tax: number;
  total: number;
} {
  const lineItems = (field<Body[]>(order, 'line_items', 'lineItems') ?? []);
  const gross = lineItems.reduce((sum, li) => {
    const qty = Number(li['quantity'] ?? 1);
    const base = Number(
      field<Body>(li, 'base_price_money', 'basePriceMoney')?.['amount'] ?? 0
    );
    return sum + base * qty;
  }, 0);
  const discounts = field<Body[]>(order, 'discounts', 'discounts') ?? [];
  const discount = Math.min(
    gross,
    discounts.reduce(
      (sum, d) =>
        sum + Number(field<Body>(d, 'amount_money', 'amountMoney')?.['amount'] ?? 0),
      0
    )
  );
  const taxable = gross - discount;
  const taxes = field<Body[]>(order, 'taxes', 'taxes') ?? [];
  const tax = taxes.reduce(
    (sum, t) => sum + Math.round((taxable * Number(t['percentage'] ?? 0)) / 100),
    0
  );
  return { gross, discount, tax, total: taxable + tax };
}

export function registerGiftCardPaymentRoutes(server: SquareMockServer): void {
  server.post('/v2/orders', (req) => {
    const body = (req.body ?? {}) as Body;
    const key = field<string>(body, 'idempotency_key', 'idempotencyKey');
    if (key && ordersByKey.has(key)) {
      return { status: 200, body: { order: ordersByKey.get(key) } };
    }
    const order = (body['order'] ?? {}) as Body;
    const { discount, tax, total } = priceOrder(order);
    realOrderCounter++;
    const stored = {
      id: `mock-order-gc-${realOrderCounter}`,
      location_id: field(order, 'location_id', 'locationId') ?? 'mock-location',
      reference_id: field(order, 'reference_id', 'referenceId'),
      state: 'OPEN',
      line_items: field(order, 'line_items', 'lineItems') ?? [],
      discounts: order['discounts'] ?? [],
      total_money: money(total),
      total_tax_money: money(tax),
      total_discount_money: money(discount),
      net_amount_due_money: money(total),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    orders.set(stored.id, stored);
    if (key) ordersByKey.set(key, stored);
    return { status: 200, body: { order: stored } };
  });

  // Orders made here; anything else (POS fixtures, payment links) falls through.
  server.get('/v2/orders/:orderId', (req) => {
    const order = orders.get(req.params['orderId']);
    return order ? { status: 200, body: { order } } : null;
  });

  server.post('/v2/orders/:orderId/pay', (req) => {
    const order = orders.get(req.params['orderId']);
    if (!order) {
      return squareError(404, 'NOT_FOUND', `Order ${req.params['orderId']} not found`);
    }
    const body = (req.body ?? {}) as Body;
    const paymentIds = field<string[]>(body, 'payment_ids', 'paymentIds') ?? [];
    for (const id of paymentIds) {
      const gift = giftCardPayments.get(id);
      if (gift && gift['status'] !== 'APPROVED') {
        return squareError(400, 'BAD_REQUEST', `Payment ${id} is ${gift['status']}`);
      }
    }
    for (const id of paymentIds) {
      const gift = giftCardPayments.get(id);
      if (gift) gift['status'] = 'COMPLETED';
    }
    order['state'] = 'COMPLETED';
    order['tenders'] = paymentIds.map((id) => ({ payment_id: id }));
    return { status: 200, body: { order } };
  });

  server.post('/v2/gift-cards/from-nonce', (req) => {
    const nonce = field<string>((req.body ?? {}) as Body, 'nonce', 'nonce') ?? '';
    const card = cardsByNonce.get(nonce);
    if (!card) {
      return squareError(404, 'NOT_FOUND', 'Gift card not found for that nonce');
    }
    return {
      status: 200,
      body: {
        gift_card: {
          id: card.id,
          type: 'DIGITAL',
          gan_source: 'SQUARE',
          state: card.state,
          balance_money: money(card.balanceCents),
          gan: card.gan,
          created_at: '2026-11-01T15:00:00Z',
        },
      },
    };
  });

  server.post('/v2/payments', (req) => {
    const body = (req.body ?? {}) as Body;
    const sourceId = field<string>(body, 'source_id', 'sourceId') ?? '';
    // Square takes either a gift card token or the gift card's id.
    const card = cardsByNonce.get(sourceId) ?? cardsById.get(sourceId);
    if (!card) return null; // a card payment: the general route takes it

    const key = field<string>(body, 'idempotency_key', 'idempotencyKey');
    if (key && giftCardPaymentsByKey.has(key)) {
      return { status: 200, body: { payment: giftCardPaymentsByKey.get(key) } };
    }
    if (field(body, 'autocomplete', 'autocomplete') !== false) {
      return squareError(
        400,
        'BAD_REQUEST',
        'A gift card payment needs autocomplete false (mock)'
      );
    }
    if (field(body, 'accept_partial_authorization', 'acceptPartialAuthorization') !== true) {
      return squareError(
        400,
        'BAD_REQUEST',
        'A gift card payment needs accept_partial_authorization (mock)'
      );
    }
    if (card.state !== 'ACTIVE') {
      return squareError(400, 'GIFT_CARD_NOT_ACTIVE', 'Gift card is not active');
    }
    const asked = Number(field<Body>(body, 'amount_money', 'amountMoney')?.['amount'] ?? 0);
    const approved = Math.min(asked, card.balanceCents);
    if (approved <= 0) {
      return squareError(402, 'INSUFFICIENT_FUNDS', 'Gift card has no balance');
    }
    card.balanceCents -= approved;

    giftPaymentCounter++;
    const payment = {
      id: `mock-gc-payment-${giftPaymentCounter}`,
      status: 'APPROVED',
      amount_money: money(approved),
      total_money: money(approved),
      approved_money: money(approved),
      source_type: 'CARD',
      card_details: {
        status: 'AUTHORIZED',
        card: { card_brand: 'SQUARE_GIFT_CARD', last_4: card.gan.slice(-4) },
      },
      gift_card_id: card.id,
      order_id: field(body, 'order_id', 'orderId'),
      reference_id: field(body, 'reference_id', 'referenceId'),
      location_id: field(body, 'location_id', 'locationId'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    giftCardPayments.set(payment.id, payment);
    if (key) giftCardPaymentsByKey.set(key, payment);
    return { status: 200, body: { payment } };
  });

  server.get('/v2/payments/:paymentId', (req) => {
    const payment = giftCardPayments.get(req.params['paymentId']);
    return payment ? { status: 200, body: { payment } } : null;
  });

  server.post('/v2/payments/cancel', () => ({ status: 200, body: {} }));

  server.post('/v2/payments/:paymentId/cancel', (req) => {
    const id = req.params['paymentId'];
    const payment = giftCardPayments.get(id);
    if (!payment) {
      // A card authorization from the general routes: nothing to give back.
      return { status: 200, body: { payment: { id, status: 'CANCELED' } } };
    }
    if (payment['status'] === 'APPROVED') {
      const card = cardsById.get(payment['gift_card_id'] as string);
      if (card) {
        card.balanceCents += Number((payment['amount_money'] as Body)['amount']);
      }
      payment['status'] = 'CANCELED';
    }
    return { status: 200, body: { payment } };
  });

  server.post('/v2/refunds', (req) => {
    const body = (req.body ?? {}) as Body;
    const paymentId = field<string>(body, 'payment_id', 'paymentId') ?? '';
    const payment = giftCardPayments.get(paymentId);
    if (!payment) return null; // a card refund: the general route takes it
    const amount = Number(field<Body>(body, 'amount_money', 'amountMoney')?.['amount'] ?? 0);
    const card = cardsById.get(payment['gift_card_id'] as string);
    if (card) card.balanceCents += amount;
    payment['refunded_money'] = money(amount);
    giftRefundCounter++;
    return {
      status: 200,
      body: {
        refund: {
          id: `mock-gc-refund-${giftRefundCounter}`,
          status: 'COMPLETED',
          amount_money: money(amount),
          payment_id: paymentId,
          order_id: payment['order_id'],
          created_at: new Date().toISOString(),
        },
      },
    };
  });

  // Test controls.
  server.post('/_mock/gift-cards', (req) => {
    const body = (req.body ?? {}) as {
      cards?: Array<{
        nonce: string;
        id: string;
        gan: string;
        balanceCents: number;
        state?: string;
      }>;
    };
    for (const c of body.cards ?? []) {
      const card: MockGiftCard = {
        id: c.id,
        gan: c.gan,
        state: c.state ?? 'ACTIVE',
        balanceCents: c.balanceCents,
      };
      cardsByNonce.set(c.nonce, card);
      cardsById.set(c.id, card);
    }
    return { status: 200, body: { ok: true } };
  });

  server.get('/_mock/gift-cards/:giftCardId', (req) => {
    const card = cardsById.get(req.params['giftCardId']);
    return card
      ? { status: 200, body: { card } }
      : squareError(404, 'NOT_FOUND', 'No such mock gift card');
  });

  // Reset ours, then let the general reset run too.
  server.post('/_mock/reset', () => {
    resetGiftCardPaymentState();
    return null;
  });
}

export function resetGiftCardPaymentState(): void {
  cardsByNonce.clear();
  cardsById.clear();
  giftCardPayments.clear();
  giftCardPaymentsByKey.clear();
  orders.clear();
  ordersByKey.clear();
  giftPaymentCounter = 0;
  realOrderCounter = 0;
  giftRefundCounter = 0;
}
