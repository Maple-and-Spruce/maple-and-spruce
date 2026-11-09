import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A fake Square that is idempotent the way the real one is (the same create
 * key returns the same card) and refuses a code already in use, the way it
 * does for a custom GAN.
 */
const square = vi.hoisted(() => {
  const state = {
    cardsByKey: new Map<string, { id: string; gan: string; last4: string }>(),
    codes: new Map<string, string>(),
    taken: new Set<string>(),
    activations: 0,
    failCreateAt: new Set<number>(),
    nextId: 1,
  };
  // Keys end "-<index>-<code>".
  const indexOf = (key: string) => Number(key.split('-').slice(-2)[0]);
  const giftCardsService = {
    createDigitalGiftCard: vi.fn(
      async ({ idempotencyKey, gan }: { idempotencyKey: string; gan?: string }) => {
        if (state.failCreateAt.has(indexOf(idempotencyKey))) {
          throw new Error('Square create down');
        }
        const existing = state.cardsByKey.get(idempotencyKey);
        if (existing) return existing;
        if (!gan) throw new Error('expected a chosen code');
        if (state.taken.has(gan)) {
          throw new Error(`Square could not create gift card: GAN ${gan} already exists`);
        }
        state.taken.add(gan);
        const n = state.nextId++;
        const card = { id: `gftc-${n}`, gan, last4: gan.slice(-4) };
        state.cardsByKey.set(idempotencyKey, card);
        state.codes.set(card.id, gan);
        return card;
      }
    ),
    activateGiftCardWithoutOrder: vi.fn(async () => {
      state.activations++;
      return { balanceCents: 0 };
    }),
    getGiftCardCode: vi.fn(async (id: string) => state.codes.get(id)),
  };
  return { state, giftCardsService };
});

vi.mock('@maple/firebase/square', () => ({
  isGiftCardCodeTakenError: (error: unknown) =>
    error instanceof Error && /already exists/.test(error.message),
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
  createCertificateCard,
  getCertificateBatch,
  printGiftCertificates,
} from './print-gift-certificates';

/** A random source that walks 0, 1, 2, … so codes are distinct and predictable. */
function counting(start = 0) {
  let next = start;
  return vi.fn((max: number) => next++ % max);
}

/** July 2099, so no code drawn here can ever be a real certificate's. */
const NOW = new Date('2099-07-04T15:00:00Z');

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
  square.state.codes.clear();
  square.state.taken.clear();
  square.state.activations = 0;
  square.state.failCreateAt.clear();
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
    expect(a.create(0, 'MAPLE2099001')).toBe(b.create(0, 'MAPLE2099001'));
    expect(a.batchId).not.toBe(c.batchId);
    expect(a.create(0, 'MAPLE2099001')).not.toBe(a.create(1, 'MAPLE2099001'));
    // A new code is a new request to Square, never a reused key.
    expect(a.create(0, 'MAPLE2099001')).not.toBe(a.create(0, 'MAPLE2099002'));
  });
});

describe('createCertificateCard', () => {
  it('draws a new code when Square has the first one', async () => {
    const tried: string[] = [];
    const create = vi.fn(async (gan: string) => {
      tried.push(gan);
      if (tried.length < 3) throw new Error('GAN already exists');
      return { id: 'gftc-x', last4: gan.slice(-4) };
    });
    const random = vi.fn().mockReturnValueOnce(482).mockReturnValueOnce(17).mockReturnValueOnce(5);

    const card = await createCertificateCard({ create, keyFor: (c) => `k-${c}`, now: NOW, random });

    expect(tried).toEqual(['MAPLE2099482', 'MAPLE2099017', 'MAPLE2099005']);
    expect(card.last4).toBe('9005');
  });

  it('gives up with a clear error after 10 clashes', async () => {
    const create = vi.fn(async () => {
      throw new Error('GAN already exists');
    });
    await expect(
      createCertificateCard({ create, keyFor: (c) => c, now: NOW, random: counting() })
    ).rejects.toThrow(/nearly used up/);
    expect(create).toHaveBeenCalledTimes(10);
  });

  it('does not redraw for any other Square error', async () => {
    const create = vi.fn(async () => {
      throw new Error('Square create down');
    });
    await expect(
      createCertificateCard({ create, keyFor: (c) => c, now: NOW, random: counting() })
    ).rejects.toThrow('Square create down');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('printGiftCertificates', () => {
  const print = (data: Parameters<typeof printGiftCertificates>[0] = amountBatch, random = counting()) =>
    printGiftCertificates(data, context, secrets, strings, random, NOW);

  it('makes each certificate with a MAPLE code and no money, and records it as printed stock', async () => {
    const result = await print();

    const { batchId } = certificateBatchKeys(amountBatch.idempotencyKey);
    expect(result).toMatchObject({ batchId, requested: 3, valueCents: 2500 });
    expect(result.error).toBeUndefined();
    expect(result.cards).toHaveLength(3);
    // In batch order: the record at each index is the card at that place.
    result.cards.forEach((c, i) => {
      expect(store.records.get(c.giftCardId)).toMatchObject({ batchIndex: i, last4: c.last4 });
    });
    for (const code of square.state.codes.values()) {
      expect(code).toMatch(/^MAPLE2099\d{3}$/);
    }
    // Nothing is loaded: the register does that at the sale.
    expect(square.giftCardsService.activateGiftCardWithoutOrder).not.toHaveBeenCalled();
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
      expect(JSON.stringify(record)).not.toMatch(/MAPLE/);
    }
    expect(records.map((r) => r['batchIndex']).sort()).toEqual([0, 1, 2]);
  });

  it('draws the digits from the random source, not in sequence', async () => {
    const random = vi.fn().mockReturnValueOnce(731).mockReturnValueOnce(64).mockReturnValueOnce(298);
    await print(amountBatch, random);
    expect([...square.state.codes.values()].sort()).toEqual([
      'MAPLE2099064',
      'MAPLE2099298',
      'MAPLE2099731',
    ]);
  });

  it('redraws when two certificates draw the same code', async () => {
    // 5, 5, 6: the second card clashes with the first and draws again.
    const random = vi.fn().mockReturnValueOnce(5).mockReturnValueOnce(5).mockReturnValue(6);
    const result = await print({ ...amountBatch, quantity: 2 }, random);
    expect(result.cards).toHaveLength(2);
    expect(new Set(square.state.codes.values()).size).toBe(2);
  });

  it('logs the batch without any code', async () => {
    // One clash, so the clash path is logged-free too.
    square.state.taken.add('MAPLE2099000');
    await print();

    const line = logs.find((l) => l.includes('gift_certificates_printed'));
    expect(line).toBeDefined();
    const event = JSON.parse(line as string);
    expect(event).toMatchObject({ count: 3, valueCents: 2500, uid: 'admin-1' });
    const everything = [...logs, ...errors].join('\n');
    expect(everything).not.toMatch(/MAPLE\d/);
  });

  it('a retry of a finished batch makes no new cards', async () => {
    const first = await print();
    const second = await print();

    expect(second.cards).toEqual(first.cards);
    expect(square.giftCardsService.createDigitalGiftCard).toHaveBeenCalledTimes(3);
    expect(store.records.size).toBe(3);
  });

  it('keeps what was made when Square fails part way, and a retry makes only the rest', async () => {
    square.state.failCreateAt.add(1);

    const partial = await print({ ...amountBatch, quantity: 7 });

    // The first group of 5 runs together; the failure stops the next group.
    expect(partial.cards).toHaveLength(4);
    expect(partial.error).toMatch(/made 4 of 7/);
    expect(partial.error).not.toMatch(/loaded/);
    expect(errors.some((e) => e.includes('gift_certificate_print_failed'))).toBe(true);

    square.state.failCreateAt.clear();
    const retried = await print({ ...amountBatch, quantity: 7 }, counting(100));

    expect(retried.error).toBeUndefined();
    expect(retried.cards).toHaveLength(7);
    expect(store.records.size).toBe(7);
    expect(retried.cards.map((c) => c.giftCardId)).toEqual(
      expect.arrayContaining(partial.cards.map((c) => c.giftCardId))
    );
  });

  it('remakes a certificate whose record failed; the first card holds nothing', async () => {
    store.failRecordFor.add('gftc-2');

    const partial = await print();
    expect(partial.cards).toHaveLength(2);

    store.failRecordFor.clear();
    const retried = await print(amountBatch, counting(100));
    expect(retried.cards).toHaveLength(3);
    expect(store.records.size).toBe(3);
    expect(square.giftCardsService.activateGiftCardWithoutOrder).not.toHaveBeenCalled();
  });

  it('fails outright when Square makes none', async () => {
    square.state.failCreateAt.add(0);
    square.state.failCreateAt.add(1);
    square.state.failCreateAt.add(2);

    await expect(print()).rejects.toThrow(/could not make the certificates/);
    expect(store.records.size).toBe(0);
  });

  it('refuses a retry that changed the amount', async () => {
    await print();

    await expect(print({ ...amountBatch, amountCents: 5000 })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(square.giftCardsService.createDigitalGiftCard).toHaveBeenCalledTimes(3);
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
    expect(square.giftCardsService.activateGiftCardWithoutOrder).not.toHaveBeenCalled();
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
