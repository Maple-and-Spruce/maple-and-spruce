import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A fake Square that keeps balances and history the way the real one does:
 * the same key returns the first answer and moves nothing twice, a decrement
 * cannot take more than the balance, and a turned-off card stays off. Any
 * step can be made to fail once.
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
    keys: new Map<string, unknown>(),
    failNext: new Set<string>(),
    nextId: 1,
    clock: Date.parse('2026-11-08T15:00:00Z'),
  };
  const stamp = () => {
    state.clock += 1000;
    return new Date(state.clock).toISOString();
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
      createdAt: stamp(),
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
    createDigitalGiftCard: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => {
      once('create');
      return keyed(idempotencyKey, () => {
        const n = state.nextId++;
        const card: Card = {
          id: `gftc-new-${n}`,
          last4: `004${n}`,
          kind: 'egift',
          state: 'pending',
          balanceCents: 0,
          createdAt: stamp(),
        };
        state.cards.set(card.id, card);
        return { id: card.id, gan: `7783320000${card.last4}`, last4: card.last4 };
      });
    }),
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
    activateGiftCardWithoutOrder: vi.fn(
      async (input: { giftCardId: string; amountCents: number; idempotencyKey: string }) => {
        once('activate');
        return keyed(input.idempotencyKey, () => {
          const card = state.cards.get(input.giftCardId)!;
          if (card.state !== 'pending') throw new Error('Gift card is already active');
          card.state = 'active';
          card.balanceCents = input.amountCents;
          record(card, 'activate', input.amountCents);
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
  return { state, giftCardsService };
});

vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(function () {
    return { giftCardsService: square.giftCardsService, locationId: 'LOC-1' };
  }),
}));

const store = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  failCreate: 0,
}));
const repos = vi.hoisted(() => ({
  GiftCardPurchaseRepository: {
    create: vi.fn(),
    findByGiftCardId: vi.fn(),
    findByReplacesGiftCardId: vi.fn(),
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

import {
  balanceAlreadyTakenOff,
  replaceGiftCard,
  replaceGiftCardKeys,
} from './replace-gift-card';

const secrets = { SQUARE_ACCESS_TOKEN: 't' };
const strings = { SQUARE_ENV: 'LOCAL', SQUARE_LOCATION_ID: 'LOC-1', SALES_TAX_RATE: '6' };
const context = { uid: 'admin-1' };
const request = { giftCardId: 'gftc-lost', idempotencyKey: 'replace-click-1' };
const replace = (data = request) => replaceGiftCard(data, context, secrets, strings);

let logs: string[];
let errors: string[];

function addLostCard(over: Partial<{ state: 'active' | 'pending' | 'deactivated' | 'blocked'; balanceCents: number }> = {}) {
  square.state.cards.set('gftc-lost', {
    id: 'gftc-lost',
    last4: '7710',
    kind: 'egift',
    state: 'active',
    balanceCents: 1800,
    createdAt: '2026-10-01T15:00:00Z',
    ...over,
  });
}

/** Money on each card, so a test can say where it is. */
function balances() {
  const lost = square.state.cards.get('gftc-lost')!;
  const fresh = [...square.state.cards.values()].filter((c) => c.id !== 'gftc-lost');
  return {
    lost: lost.balanceCents,
    lostState: lost.state,
    fresh: fresh.map((c) => c.balanceCents),
    freshStates: fresh.map((c) => c.state),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  square.state.cards.clear();
  square.state.history.length = 0;
  square.state.keys.clear();
  square.state.failNext.clear();
  square.state.nextId = 1;
  store.records.clear();
  store.failCreate = 0;
  addLostCard();

  repos.GiftCardPurchaseRepository.create.mockImplementation(async (input) => {
    if (store.failCreate > 0) {
      store.failCreate--;
      throw new Error('Firestore down');
    }
    if (store.records.has(input.giftCardId)) throw Object.assign(new Error('exists'), { code: 6 });
    // Written "now": just before the fake Square's next activity.
    const record = { ...input, createdAt: new Date(square.state.clock) };
    store.records.set(input.giftCardId, record);
    return record;
  });
  repos.GiftCardPurchaseRepository.findByGiftCardId.mockImplementation(async (id) =>
    store.records.get(id)
  );
  repos.GiftCardPurchaseRepository.findByReplacesGiftCardId.mockImplementation(async (id) =>
    [...store.records.values()].find((r) => r['replacesGiftCardId'] === id)
  );

  logs = [];
  errors = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.map(String).join(' '));
  });
});

afterEach(() => vi.restoreAllMocks());

describe('replaceGiftCardKeys', () => {
  it('derives the create from the click and the moves from the new card', () => {
    const a = replaceGiftCardKeys('click-1', 'gftc-new-1');
    expect(replaceGiftCardKeys('click-1', 'other').create).toBe(a.create);
    expect(replaceGiftCardKeys('click-2', 'gftc-new-1').activate).toBe(a.activate);
    expect(a.decrement(1800)).not.toBe(a.decrement(1700));
    expect(new Set([a.create, a.activate, a.deactivate, a.decrement(1)]).size).toBe(4);
  });
});

describe('balanceAlreadyTakenOff', () => {
  const recordedAt = new Date('2026-11-08T15:00:00Z');
  const decrement = (amountCents: number, createdAt: string) => ({
    id: 'a',
    giftCardId: 'g',
    type: 'adjust_decrement' as const,
    amountCents,
    balanceAfterCents: 0,
    createdAt,
  });
  it('sees a decrement of the amount made after the replacement started', () => {
    expect(balanceAlreadyTakenOff([decrement(-1800, '2026-11-08T15:00:05Z')], 1800, recordedAt)).toBe(true);
    // Square's clock may run a little behind ours.
    expect(balanceAlreadyTakenOff([decrement(-1800, '2026-11-08T14:58:00Z')], 1800, recordedAt)).toBe(true);
  });
  it('ignores another amount or an old decrement', () => {
    expect(balanceAlreadyTakenOff([decrement(-1700, '2026-11-08T15:00:05Z')], 1800, recordedAt)).toBe(false);
    expect(balanceAlreadyTakenOff([decrement(-1800, '2026-11-01T15:00:00Z')], 1800, recordedAt)).toBe(false);
  });
});

describe('replaceGiftCard', () => {
  it('moves the balance to a new card, turns the lost one off and records it', async () => {
    const result = await replace();

    expect(result).toEqual({
      oldGiftCardId: 'gftc-lost',
      newGiftCardId: 'gftc-new-1',
      last4: '0041',
      balanceCents: 1800,
    });
    expect(balances()).toEqual({
      lost: 0,
      lostState: 'deactivated',
      fresh: [1800],
      freshStates: ['active'],
    });
    expect(store.records.get('gftc-new-1')).toMatchObject({
      source: 'replacement',
      replacesGiftCardId: 'gftc-lost',
      valueCents: 1800,
      kind: 'amount',
      last4: '0041',
      recordedByUid: 'admin-1',
    });
    // Off the old card before it goes on the new one.
    const order = square.state.history.map((a) => `${a.giftCardId}:${a.type}`);
    expect(order).toEqual([
      'gftc-lost:adjust_decrement',
      'gftc-new-1:activate',
      'gftc-lost:deactivate',
    ]);
  });

  it('logs the move with ids and amount, never a code', async () => {
    await replace();
    const line = logs.find((l) => l.includes('gift_card_replaced'));
    expect(JSON.parse(line as string)).toEqual({
      event: 'gift_card_replaced',
      oldId: 'gftc-lost',
      newId: 'gftc-new-1',
      balanceCents: 1800,
      uid: 'admin-1',
    });
    expect([...logs, ...errors].join('\n')).not.toMatch(/7783320000/);
  });

  it('keeps a class certificate a class certificate', async () => {
    store.records.set('gftc-lost', {
      giftCardId: 'gftc-lost',
      kind: 'class',
      source: 'register',
      classCategoryId: 'cat-glass',
      className: 'Stained Glass',
      valueCents: 8500,
    });
    await replace();
    expect(store.records.get('gftc-new-1')).toMatchObject({
      kind: 'class',
      classCategoryId: 'cat-glass',
      className: 'Stained Glass',
      valueCents: 1800,
    });
  });

  it('a second click after it finished changes nothing and answers the same', async () => {
    const first = await replace();
    const second = await replace({ ...request, idempotencyKey: 'replace-click-2' });

    expect(second).toEqual(first);
    expect(square.giftCardsService.createDigitalGiftCard).toHaveBeenCalledTimes(1);
    expect(square.state.history).toHaveLength(3);
  });

  it.each([
    ['pending', 0, /not been sold yet/],
    ['deactivated', 1800, /turned off/],
    ['blocked', 1800, /blocked/],
  ] as const)('refuses a %s card before touching Square', async (state, balanceCents, message) => {
    addLostCard({ state, balanceCents });
    await expect(replace()).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(message),
    });
    expect(square.giftCardsService.createDigitalGiftCard).not.toHaveBeenCalled();
  });

  it('refuses a card with nothing on it', async () => {
    addLostCard({ balanceCents: 0 });
    await expect(replace()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(square.giftCardsService.createDigitalGiftCard).not.toHaveBeenCalled();
  });

  it('says not found for an unknown card, and needs the id and key', async () => {
    await expect(replace({ ...request, giftCardId: 'nope' })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(replace({ ...request, giftCardId: '' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(replace({ ...request, idempotencyKey: ' ' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  describe('a failure at each step leaves the money on at most one card, and a retry finishes', () => {
    it('create: nothing moved', async () => {
      square.state.failNext.add('create');
      await expect(replace()).rejects.toThrow(/nothing was moved/);
      expect(balances()).toMatchObject({ lost: 1800, lostState: 'active', fresh: [] });
      expect(store.records.size).toBe(0);

      await replace();
      expect(balances()).toMatchObject({ lost: 0, fresh: [1800] });
    });

    it('record: nothing moved, and the same click reuses the same new card', async () => {
      store.failCreate = 1;
      await expect(replace()).rejects.toThrow(/nothing was moved/);
      expect(balances()).toMatchObject({ lost: 1800, fresh: [0], freshStates: ['pending'] });

      await replace();
      expect(balances()).toMatchObject({ lost: 0, fresh: [1800] });
      expect(square.state.cards.size).toBe(2);
    });

    it('decrement: the lost card keeps its balance', async () => {
      square.state.failNext.add('decrement');
      await expect(replace()).rejects.toThrow(/still holds its balance/);
      expect(balances()).toMatchObject({ lost: 1800, fresh: [0], freshStates: ['pending'] });

      await replace();
      expect(balances()).toEqual({
        lost: 0,
        lostState: 'deactivated',
        fresh: [1800],
        freshStates: ['active'],
      });
    });

    it('activate: off the lost card, not yet on the new one, never on both; a retry puts it on', async () => {
      square.state.failNext.add('activate');
      await expect(replace()).rejects.toThrow(/Nothing is lost: try again/);
      expect(balances()).toMatchObject({ lost: 0, lostState: 'active', fresh: [0] });
      expect(errors.some((e) => e.includes('"step":"activate"'))).toBe(true);

      // A retry, even from a fresh dialog, finishes without a second decrement.
      await replace({ ...request, idempotencyKey: 'replace-click-2' });
      expect(balances()).toEqual({
        lost: 0,
        lostState: 'deactivated',
        fresh: [1800],
        freshStates: ['active'],
      });
      expect(square.giftCardsService.adjustDecrement).toHaveBeenCalledTimes(1);
      expect(square.state.history.filter((a) => a.type === 'adjust_decrement')).toHaveLength(1);
    });

    it('deactivate: the money is on the new card, with a warning; a retry turns the old one off', async () => {
      square.state.failNext.add('deactivate');
      const result = await replace();
      expect(result.warning).toMatch(/did not turn the lost card off/);
      expect(balances()).toEqual({
        lost: 0,
        lostState: 'active',
        fresh: [1800],
        freshStates: ['active'],
      });

      const retried = await replace();
      expect(retried.warning).toBeUndefined();
      expect(balances().lostState).toBe('deactivated');
      expect(square.giftCardsService.activateGiftCardWithoutOrder).toHaveBeenCalledTimes(1);
    });
  });

  it('never takes more than is on the lost card: a card spent meanwhile fails with nothing moved', async () => {
    square.state.failNext.add('decrement');
    await expect(replace()).rejects.toThrow();
    // Someone spends part of the lost card before the retry.
    square.state.cards.get('gftc-lost')!.balanceCents = 1000;

    await expect(replace()).rejects.toThrow(/still holds its balance/);
    expect(balances()).toMatchObject({ lost: 1000, fresh: [0] });
  });
});
