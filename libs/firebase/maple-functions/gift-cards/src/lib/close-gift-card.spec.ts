import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A fake Square that keeps balances, history and refunds the way the real one
 * does: the same key returns the first answer and moves nothing twice, a
 * decrement cannot take more than the balance, and a turned-off card stays
 * off. Any step can be made to fail once.
 */
const square = vi.hoisted(() => {
  type Card = {
    id: string;
    last4: string;
    kind: 'egift';
    state: 'active' | 'pending' | 'deactivated' | 'blocked';
    balanceCents: number;
    createdAt: string;
  };
  type Activity = {
    id: string;
    giftCardId: string;
    type: string;
    amountCents: number | null;
    balanceAfterCents: number | null;
    createdAt: string;
  };
  const state = {
    cards: new Map<string, Card>(),
    history: [] as Activity[],
    refunds: [] as { paymentId: string; amountCents: number }[],
    keys: new Map<string, unknown>(),
    failNext: new Set<string>(),
  };
  const once = (step: string) => {
    if (state.failNext.has(step)) {
      state.failNext.delete(step);
      throw new Error(`Square ${step} down`);
    }
  };
  const record = (card: Card, type: string, amountCents: number | null) =>
    state.history.push({
      id: `act-${state.history.length + 1}`,
      giftCardId: card.id,
      type,
      amountCents,
      balanceAfterCents: card.balanceCents,
      createdAt: new Date().toISOString(),
    });
  const keyed = async <T>(key: string, work: () => T): Promise<T> => {
    if (state.keys.has(key)) return state.keys.get(key) as T;
    const result = work();
    state.keys.set(key, result);
    return result;
  };
  const giftCardsService = {
    getGiftCard: vi.fn(async (id: string) => {
      const card = state.cards.get(id);
      return card ? { ...card } : undefined;
    }),
    listCardHistory: vi.fn(async (id: string) =>
      state.history.filter((a) => a.giftCardId === id).reverse()
    ),
    adjustDecrement: vi.fn(
      async (input: { giftCardId: string; amountCents: number; idempotencyKey: string }) => {
        once('decrement');
        return keyed(input.idempotencyKey, () => {
          const card = state.cards.get(input.giftCardId)!;
          if (card.state !== 'active') throw new Error('INVALID_GIFT_CARD_STATE');
          if (input.amountCents > card.balanceCents) throw new Error('INSUFFICIENT_FUNDS');
          card.balanceCents -= input.amountCents;
          record(card, 'adjust_decrement', -input.amountCents);
          return { balanceCents: card.balanceCents };
        });
      }
    ),
    deactivate: vi.fn(async (input: { giftCardId: string; idempotencyKey: string }) => {
      once('deactivate');
      return keyed(input.idempotencyKey, () => {
        const card = state.cards.get(input.giftCardId)!;
        card.state = 'deactivated';
        record(card, 'deactivate', null);
      });
    }),
  };
  const paymentsService = {
    refundPayment: vi.fn(
      async (input: { paymentId: string; amountCents: number; idempotencyKey: string }) => {
        once('refund');
        return keyed(input.idempotencyKey, () => {
          state.refunds.push({ paymentId: input.paymentId, amountCents: input.amountCents });
          return { refundId: `refund-${state.refunds.length}`, status: 'PENDING' };
        });
      }
    ),
  };
  return { state, giftCardsService, paymentsService };
});

vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(function () {
    return {
      giftCardsService: square.giftCardsService,
      paymentsService: square.paymentsService,
      locationId: 'LOC-1',
    };
  }),
}));

const store = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>() }));
const repos = vi.hoisted(() => ({
  GiftCardPurchaseRepository: {
    findByGiftCardId: vi.fn(),
    startClosure: vi.fn(),
    updateClosure: vi.fn(),
  },
}));
vi.mock('@maple/firebase/database', () => repos);

vi.mock('@maple/firebase/functions', () => ({
  throwNotFound: (entity: string, id: string) => {
    throw Object.assign(new Error(`${entity} with ID ${id} not found`), { code: 'not-found' });
  },
  throwInvalidArgument: (message: string) => {
    throw Object.assign(new Error(message), { code: 'invalid-argument' });
  },
  throwFailedPrecondition: (message: string) => {
    throw Object.assign(new Error(message), { code: 'failed-precondition' });
  },
}));

import { isRefundableOnline } from '@maple/ts/domain';
import { closeGiftCard, closeGiftCardKeys } from './close-gift-card';

const secrets = { SQUARE_ACCESS_TOKEN: 't' };
const strings = { SQUARE_ENV: 'LOCAL', SQUARE_LOCATION_ID: 'LOC-1', SALES_TAX_RATE: '6' };
const context = { uid: 'admin-1' };
const close = (mode: 'refund' | 'deactivate', giftCardId = 'gftc-online') =>
  closeGiftCard({ giftCardId, mode }, context, secrets, strings);

function addCard(
  id: string,
  over: Partial<{ state: 'active' | 'pending' | 'deactivated' | 'blocked'; balanceCents: number }> = {}
) {
  square.state.cards.set(id, {
    id,
    last4: '',
    kind: 'egift',
    state: 'active',
    balanceCents: 4000,
    createdAt: '2026-11-08T10:00:00Z',
    ...over,
  });
}

function addOnlineRecord(over: Record<string, unknown> = {}) {
  store.records.set('gftc-online', {
    giftCardId: 'gftc-online',
    last4: '',
    kind: 'class',
    valueCents: 4000,
    source: 'online',
    squarePaymentId: 'pay-online-1',
    buyerName: 'Robin Ashfield',
    buyerEmail: 'robin@example.com',
    createdAt: new Date('2026-11-08T10:00:00Z'),
    ...over,
  });
}

let logs: string[];
let errors: string[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T15:00:00Z'));
  vi.clearAllMocks();
  square.state.cards.clear();
  square.state.history.length = 0;
  square.state.refunds.length = 0;
  square.state.keys.clear();
  square.state.failNext.clear();
  store.records.clear();

  repos.GiftCardPurchaseRepository.findByGiftCardId.mockImplementation(async (id) =>
    store.records.get(id)
  );
  repos.GiftCardPurchaseRepository.startClosure.mockImplementation(async (id, closure) => {
    const rec = store.records.get(id)!;
    if (rec['closure']) return rec['closure'];
    rec['closure'] = { ...closure };
    return closure;
  });
  repos.GiftCardPurchaseRepository.updateClosure.mockImplementation(async (id, fields) => {
    const rec = store.records.get(id)!;
    rec['closure'] = { ...(rec['closure'] as object), ...fields };
  });

  logs = [];
  errors = [];
  vi.spyOn(console, 'log').mockImplementation((m: string) => logs.push(m));
  vi.spyOn(console, 'error').mockImplementation((m: string) => errors.push(String(m)));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('closeGiftCard: refund', () => {
  it('takes the balance off, refunds it to the original payment and turns the card off', async () => {
    addCard('gftc-online');
    addOnlineRecord();

    const result = await close('refund');

    expect(result).toEqual({
      giftCardId: 'gftc-online',
      mode: 'refund',
      amountCents: 4000,
      refundedCents: 4000,
    });
    const card = square.state.cards.get('gftc-online')!;
    expect(card.balanceCents).toBe(0);
    expect(card.state).toBe('deactivated');
    expect(square.state.refunds).toEqual([{ paymentId: 'pay-online-1', amountCents: 4000 }]);
    // The balance came off before the refund.
    expect(square.giftCardsService.adjustDecrement.mock.invocationCallOrder[0]).toBeLessThan(
      square.paymentsService.refundPayment.mock.invocationCallOrder[0]
    );
    const closure = store.records.get('gftc-online')!['closure'] as Record<string, unknown>;
    expect(closure).toMatchObject({
      kind: 'refund',
      amountCents: 4000,
      squareRefundId: 'refund-1',
      byUid: 'admin-1',
    });
    expect(closure['completedAt']).toBeTruthy();
    expect(logs.some((l) => l.includes('"event":"gift_card_closed"'))).toBe(true);
  });

  it('refunds only what is left on a card that was partly spent', async () => {
    addCard('gftc-online', { balanceCents: 1500 });
    addOnlineRecord();

    const result = await close('refund');

    expect(result.refundedCents).toBe(1500);
    expect(square.state.refunds).toEqual([{ paymentId: 'pay-online-1', amountCents: 1500 }]);
  });

  it('refuses a card that was topped up beyond what was paid online', async () => {
    addCard('gftc-online', { balanceCents: 6000 });
    addOnlineRecord();

    await expect(close('refund')).rejects.toThrow(/topped up at the register/);
    expect(square.state.cards.get('gftc-online')!.balanceCents).toBe(6000);
    expect(square.state.refunds).toEqual([]);
  });

  it('refuses a card with nothing left on it', async () => {
    addCard('gftc-online', { balanceCents: 0 });
    addOnlineRecord();

    await expect(close('refund')).rejects.toThrow(/Nothing is left on this card/);
  });

  it('refuses to refund a card not bought on the website', async () => {
    addCard('gftc-register');
    await expect(close('refund', 'gftc-register')).rejects.toThrow(
      /Only a card bought on the website can be refunded here/
    );
    expect(square.giftCardsService.adjustDecrement).not.toHaveBeenCalled();
  });

  it('after a failed refund, a retry refunds once without taking money off twice', async () => {
    addCard('gftc-online');
    addOnlineRecord();
    square.state.failNext.add('refund');

    await expect(close('refund')).rejects.toThrow(/Nothing is lost: try again/);
    // The money is off the card and not yet refunded; the record holds the amount.
    expect(square.state.cards.get('gftc-online')!.balanceCents).toBe(0);
    expect(square.state.refunds).toEqual([]);

    const result = await close('refund');

    expect(result.refundedCents).toBe(4000);
    expect(square.state.refunds).toEqual([{ paymentId: 'pay-online-1', amountCents: 4000 }]);
    expect(
      square.state.history.filter((a) => a.type === 'adjust_decrement')
    ).toHaveLength(1);
    expect(square.state.cards.get('gftc-online')!.state).toBe('deactivated');
  });

  it('after a failed decrement, nothing was refunded and a retry finishes', async () => {
    addCard('gftc-online');
    addOnlineRecord();
    square.state.failNext.add('decrement');

    await expect(close('refund')).rejects.toThrow(/nothing was refunded/);
    expect(square.state.cards.get('gftc-online')!.balanceCents).toBe(4000);
    expect(square.state.refunds).toEqual([]);

    await close('refund');
    expect(square.state.refunds).toHaveLength(1);
  });

  it('warns when the card could not be turned off; a retry turns it off', async () => {
    addCard('gftc-online');
    addOnlineRecord();
    square.state.failNext.add('deactivate');

    const first = await close('refund');
    expect(first.warning).toMatch(/did not turn the card off/);
    expect(square.state.refunds).toHaveLength(1);

    const second = await close('refund');
    expect(second.warning).toBeUndefined();
    expect(square.state.refunds).toHaveLength(1);
    expect(square.state.cards.get('gftc-online')!.state).toBe('deactivated');
  });

  it('will not switch a started refund to a plain turn-off', async () => {
    addCard('gftc-online');
    addOnlineRecord({ closure: { kind: 'refund', amountCents: 4000, startedAt: new Date().toISOString() } });
    await expect(close('deactivate')).rejects.toThrow(/refund of this card was already started/);
  });
});

describe('closeGiftCard: deactivate', () => {
  it('takes what is left off any card and turns it off, refunding nothing', async () => {
    addCard('gftc-register', { balanceCents: 2500 });

    const result = await close('deactivate', 'gftc-register');

    expect(result).toEqual({
      giftCardId: 'gftc-register',
      mode: 'deactivate',
      amountCents: 2500,
      refundedCents: 0,
    });
    const card = square.state.cards.get('gftc-register')!;
    expect(card.balanceCents).toBe(0);
    expect(card.state).toBe('deactivated');
    expect(square.paymentsService.refundPayment).not.toHaveBeenCalled();
  });

  it('turns off an empty card without a decrement', async () => {
    addCard('gftc-register', { balanceCents: 0 });
    await close('deactivate', 'gftc-register');
    expect(square.giftCardsService.adjustDecrement).not.toHaveBeenCalled();
    expect(square.state.cards.get('gftc-register')!.state).toBe('deactivated');
  });

  it('refuses a card already off, or a certificate never sold', async () => {
    addCard('gftc-off', { state: 'deactivated', balanceCents: 0 });
    addCard('gftc-unsold', { state: 'pending', balanceCents: 0 });
    await expect(close('deactivate', 'gftc-off')).rejects.toThrow(/already turned off/);
    await expect(close('deactivate', 'gftc-unsold')).rejects.toThrow(/has not been sold yet/);
  });

  it('needs a card id and a mode', async () => {
    await expect(
      closeGiftCard({ giftCardId: '', mode: 'refund' }, context, secrets, strings)
    ).rejects.toThrow(/Gift card id is required/);
    await expect(
      closeGiftCard({ giftCardId: 'x', mode: 'other' as 'refund' }, context, secrets, strings)
    ).rejects.toThrow(/Choose refund or deactivate/);
  });
});

describe('closeGiftCard helpers', () => {
  it('keys come from the card, so a retry reuses them', () => {
    expect(closeGiftCardKeys('gftc-a')).toEqual(
      expect.objectContaining({ refund: closeGiftCardKeys('gftc-a').refund })
    );
    expect(closeGiftCardKeys('gftc-a').refund).not.toBe(closeGiftCardKeys('gftc-b').refund);
    for (const key of [
      closeGiftCardKeys('gftc-a').refund,
      closeGiftCardKeys('gftc-a').deactivate,
      closeGiftCardKeys('gftc-a').decrement(100000),
    ]) {
      expect(key.length).toBeLessThanOrEqual(45);
    }
  });

  it('only an online purchase with its payment is refundable', () => {
    expect(isRefundableOnline({ squarePaymentId: 'p' })).toBe(true);
    expect(isRefundableOnline({ source: 'online', squarePaymentId: 'p' })).toBe(true);
    expect(isRefundableOnline({ source: 'stock', squarePaymentId: undefined })).toBe(false);
    expect(isRefundableOnline({ source: 'replacement' })).toBe(false);
    expect(isRefundableOnline(undefined)).toBe(false);
  });
});
