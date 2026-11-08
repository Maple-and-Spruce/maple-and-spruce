import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A fake Square that is idempotent the way the real one is: the same create
 * key returns the same card, and the same activate key does not load twice.
 */
const square = vi.hoisted(() => {
  const state = {
    cardsByKey: new Map<string, { id: string; gan: string; last4: string }>(),
    activatedKeys: new Set<string>(),
    loads: [] as Array<{ giftCardId: string; amountCents: number }>,
    codes: new Map<string, string>(),
    failCreateAt: new Set<number>(),
    failActivateAt: new Set<number>(),
    nextId: 1,
  };
  const indexOf = (key: string) => Number(key.split('-').pop());
  const giftCardsService = {
    createDigitalGiftCard: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => {
      if (state.failCreateAt.has(indexOf(idempotencyKey))) throw new Error('Square create down');
      const existing = state.cardsByKey.get(idempotencyKey);
      if (existing) return existing;
      const n = state.nextId++;
      const gan = `77833200000${String(n).padStart(5, '0')}`;
      const card = { id: `gftc-${n}`, gan, last4: gan.slice(-4) };
      state.cardsByKey.set(idempotencyKey, card);
      state.codes.set(card.id, gan);
      return card;
    }),
    activateGiftCardWithoutOrder: vi.fn(
      async (input: { giftCardId: string; amountCents: number; idempotencyKey: string }) => {
        if (state.failActivateAt.has(indexOf(input.idempotencyKey))) {
          throw new Error('Square activate down');
        }
        if (!state.activatedKeys.has(input.idempotencyKey)) {
          state.activatedKeys.add(input.idempotencyKey);
          state.loads.push({ giftCardId: input.giftCardId, amountCents: input.amountCents });
        }
        return { balanceCents: input.amountCents };
      }
    ),
    getGiftCardCode: vi.fn(async (id: string) => state.codes.get(id)),
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
  failRecordFor: new Set<string>(),
}));

const repos = vi.hoisted(() => ({
  GiftCardPurchaseRepository: {
    create: vi.fn(),
    findByGiftCardId: vi.fn(),
    findByBatchId: vi.fn(),
  },
  ClassCategoryRepository: { findById: vi.fn() },
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
  throwValidationError: (errors: Record<string, string[]>) => {
    throw Object.assign(new Error(`Validation failed: ${JSON.stringify(errors)}`), {
      code: 'invalid-argument',
    });
  },
}));

import {
  certificateBatchKeys,
  getCertificateBatch,
  printGiftCertificates,
} from './print-gift-certificates';

const secrets = { SQUARE_ACCESS_TOKEN: 't' };
const strings = { SQUARE_ENV: 'LOCAL', SQUARE_LOCATION_ID: 'LOC-1', SALES_TAX_RATE: '6' };
const context = { uid: 'admin-1' };
const glass = {
  id: 'cat-glass',
  name: 'Stained Glass',
  order: 1,
  giftCertificateEnabled: true,
  giftCertificatePriceCents: 8500,
};

const amountBatch = {
  kind: 'amount' as const,
  amountCents: 2500,
  quantity: 3,
  design: 'stained-glass' as const,
  idempotencyKey: 'print-batch-0001',
};

let logs: string[];
let errors: string[];

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(square.state, { nextId: 1 });
  square.state.cardsByKey.clear();
  square.state.activatedKeys.clear();
  square.state.loads.length = 0;
  square.state.codes.clear();
  square.state.failCreateAt.clear();
  square.state.failActivateAt.clear();
  store.records.clear();
  store.failRecordFor.clear();

  repos.GiftCardPurchaseRepository.create.mockImplementation(async (input) => {
    if (store.failRecordFor.has(input.giftCardId)) throw new Error('Firestore down');
    if (store.records.has(input.giftCardId)) throw Object.assign(new Error('exists'), { code: 6 });
    const record = { ...input, createdAt: new Date('2026-11-08T12:00:00Z') };
    store.records.set(input.giftCardId, record);
    return record;
  });
  repos.GiftCardPurchaseRepository.findByGiftCardId.mockImplementation(async (id) =>
    store.records.get(id)
  );
  repos.GiftCardPurchaseRepository.findByBatchId.mockImplementation(async (batchId) =>
    [...store.records.values()]
      .filter((r) => r['batchId'] === batchId)
      .sort((a, b) => (a['batchIndex'] as number) - (b['batchIndex'] as number))
  );
  repos.ClassCategoryRepository.findById.mockResolvedValue(glass);

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

describe('certificateBatchKeys', () => {
  it('gives the same batch and keys for the same dialog, and new ones for another', () => {
    const a = certificateBatchKeys('print-batch-0001');
    const b = certificateBatchKeys('print-batch-0001');
    const c = certificateBatchKeys('print-batch-0002');
    expect(a.batchId).toBe(b.batchId);
    expect(a.card(0)).toEqual(b.card(0));
    expect(a.batchId).not.toBe(c.batchId);
    expect(a.card(0).create).not.toBe(a.card(1).create);
    expect(a.card(0).activate).not.toBe(a.card(0).create);
  });
});

describe('printGiftCertificates', () => {
  it('makes, loads and records each certificate as printed stock', async () => {
    const result = await printGiftCertificates(amountBatch, context, secrets, strings);

    const { batchId } = certificateBatchKeys(amountBatch.idempotencyKey);
    expect(result).toMatchObject({ batchId, requested: 3, valueCents: 2500 });
    expect(result.error).toBeUndefined();
    expect(result.cards).toHaveLength(3);
    // In batch order: the record at each index is the card at that place.
    result.cards.forEach((c, i) => {
      expect(store.records.get(c.giftCardId)).toMatchObject({ batchIndex: i, last4: c.last4 });
    });
    expect(square.state.loads).toHaveLength(3);
    expect(square.state.loads.every((l) => l.amountCents === 2500)).toBe(true);
    const records = [...store.records.values()];
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record).toMatchObject({
        source: 'stock',
        kind: 'amount',
        valueCents: 2500,
        batchId,
        design: 'stained-glass',
        recordedByUid: 'admin-1',
      });
    }
    expect(records.map((r) => r['batchIndex']).sort()).toEqual([0, 1, 2]);
  });

  it('logs the batch without any code', async () => {
    await printGiftCertificates(amountBatch, context, secrets, strings);

    const line = logs.find((l) => l.includes('gift_certificates_printed'));
    expect(line).toBeDefined();
    const event = JSON.parse(line as string);
    expect(event).toMatchObject({ count: 3, valueCents: 2500, uid: 'admin-1' });
    const everything = [...logs, ...errors].join('\n');
    for (const code of square.state.codes.values()) {
      expect(everything).not.toContain(code);
    }
  });

  it('a retry of a finished batch makes no new cards and loads nothing again', async () => {
    const first = await printGiftCertificates(amountBatch, context, secrets, strings);
    const second = await printGiftCertificates(amountBatch, context, secrets, strings);

    expect(second.cards).toEqual(first.cards);
    expect(square.giftCardsService.createDigitalGiftCard).toHaveBeenCalledTimes(3);
    expect(square.state.loads).toHaveLength(3);
    expect(store.records.size).toBe(3);
  });

  it('keeps what was made when Square fails part way, and a retry makes only the rest', async () => {
    square.state.failActivateAt.add(1);

    const partial = await printGiftCertificates(
      { ...amountBatch, quantity: 7 },
      context,
      secrets,
      strings
    );

    // The first group of 5 runs together; the failure stops the next group.
    expect(partial.cards).toHaveLength(4);
    expect(partial.error).toMatch(/made 4 of 7/);
    expect(square.state.loads).toHaveLength(4);
    expect(errors.some((e) => e.includes('gift_certificate_print_failed'))).toBe(true);

    square.state.failActivateAt.clear();
    const retried = await printGiftCertificates(
      { ...amountBatch, quantity: 7 },
      context,
      secrets,
      strings
    );

    expect(retried.error).toBeUndefined();
    expect(retried.cards).toHaveLength(7);
    // Card 1 was made but not loaded the first time; the retry reuses it.
    expect(square.state.cardsByKey.size).toBe(7);
    expect(square.state.loads).toHaveLength(7);
    expect(new Set(square.state.loads.map((l) => l.giftCardId)).size).toBe(7);
    expect(store.records.size).toBe(7);
    expect(retried.cards.map((c) => c.giftCardId)).toEqual(
      expect.arrayContaining(partial.cards.map((c) => c.giftCardId))
    );
  });

  it('finishes a certificate whose record failed, without loading it twice', async () => {
    square.state.failCreateAt.clear();
    store.failRecordFor.add('gftc-2');

    const partial = await printGiftCertificates(amountBatch, context, secrets, strings);
    expect(partial.cards).toHaveLength(2);
    expect(square.state.loads).toHaveLength(3);

    store.failRecordFor.clear();
    const retried = await printGiftCertificates(amountBatch, context, secrets, strings);
    expect(retried.cards).toHaveLength(3);
    expect(square.state.loads).toHaveLength(3);
  });

  it('fails outright when Square makes none', async () => {
    square.state.failCreateAt.add(0);
    square.state.failCreateAt.add(1);
    square.state.failCreateAt.add(2);

    await expect(
      printGiftCertificates(amountBatch, context, secrets, strings)
    ).rejects.toThrow(/nothing was loaded/);
    expect(square.state.loads).toHaveLength(0);
    expect(store.records.size).toBe(0);
  });

  it('refuses a retry that changed the amount', async () => {
    await printGiftCertificates(amountBatch, context, secrets, strings);

    await expect(
      printGiftCertificates({ ...amountBatch, amountCents: 5000 }, context, secrets, strings)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(square.state.loads).toHaveLength(3);
  });

  it('prices a class batch from the class type', async () => {
    const result = await printGiftCertificates(
      {
        kind: 'class',
        classCategoryId: 'cat-glass',
        quantity: 2,
        design: 'stained-glass',
        idempotencyKey: 'print-batch-0003',
      },
      context,
      secrets,
      strings
    );

    expect(result.valueCents).toBe(8500);
    expect(square.state.loads.every((l) => l.amountCents === 8500)).toBe(true);
    expect([...store.records.values()][0]).toMatchObject({
      kind: 'class',
      classCategoryId: 'cat-glass',
      className: 'Stained Glass',
    });
  });

  it('refuses a class type with certificates switched off, before touching Square', async () => {
    repos.ClassCategoryRepository.findById.mockResolvedValue({
      ...glass,
      giftCertificateEnabled: false,
    });

    await expect(
      printGiftCertificates(
        {
          kind: 'class',
          classCategoryId: 'cat-glass',
          quantity: 2,
          design: 'stained-glass',
          idempotencyKey: 'print-batch-0004',
        },
        context,
        secrets,
        strings
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(square.giftCardsService.createDigitalGiftCard).not.toHaveBeenCalled();
  });

  it('refuses an unknown class type', async () => {
    repos.ClassCategoryRepository.findById.mockResolvedValue(undefined);
    await expect(
      printGiftCertificates(
        {
          kind: 'class',
          classCategoryId: 'nope',
          quantity: 1,
          design: 'stained-glass',
          idempotencyKey: 'print-batch-0005',
        },
        context,
        secrets,
        strings
      )
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it.each([
    ['too many', { quantity: 51 }],
    ['no design', { design: 'pottery' }],
    ['cents', { amountCents: 2550 }],
  ])('validates before any Square call: %s', async (_name, over) => {
    await expect(
      printGiftCertificates(
        { ...amountBatch, ...over } as typeof amountBatch,
        context,
        secrets,
        strings
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(square.giftCardsService.createDigitalGiftCard).not.toHaveBeenCalled();
    expect(repos.GiftCardPurchaseRepository.findByBatchId).not.toHaveBeenCalled();
  });
});

describe('getCertificateBatch', () => {
  it('returns every code in batch order and logs the read without them', async () => {
    const printed = await printGiftCertificates(amountBatch, context, secrets, strings);
    logs.length = 0;

    const batch = await getCertificateBatch(
      { batchId: printed.batchId },
      context,
      secrets,
      strings
    );

    expect(batch).toMatchObject({
      batchId: printed.batchId,
      design: 'stained-glass',
      kind: 'amount',
      valueCents: 2500,
    });
    expect(batch.certificates.map((c) => c.giftCardId)).toEqual(
      printed.cards.map((c) => c.giftCardId)
    );
    for (const cert of batch.certificates) {
      expect(cert.code).toBe(square.state.codes.get(cert.giftCardId));
      expect(cert.code.endsWith(cert.last4)).toBe(true);
    }
    const event = JSON.parse(logs.find((l) => l.includes('gift_certificate_batch_revealed')) as string);
    expect(event).toEqual({
      event: 'gift_certificate_batch_revealed',
      batchId: printed.batchId,
      count: 3,
      uid: 'admin-1',
    });
    for (const code of square.state.codes.values()) {
      expect(logs.join('\n')).not.toContain(code);
    }
  });

  it('says not found for an unknown batch', async () => {
    await expect(
      getCertificateBatch({ batchId: 'cert-nope' }, context, secrets, strings)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('needs a batch id', async () => {
    await expect(
      getCertificateBatch({ batchId: ' ' }, context, secrets, strings)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('fails when Square cannot read a code', async () => {
    const printed = await printGiftCertificates(amountBatch, context, secrets, strings);
    square.state.codes.delete(printed.cards[1].giftCardId);

    await expect(
      getCertificateBatch({ batchId: printed.batchId }, context, secrets, strings)
    ).rejects.toThrow(/could not read the codes/);
  });
});
