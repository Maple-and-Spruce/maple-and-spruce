import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const giftCardsService = vi.hoisted(() => ({
  getGiftCard: vi.fn(),
  listActivities: vi.fn(),
  listCardHistory: vi.fn(),
  createDigitalGiftCard: vi.fn(),
  activateGiftCardWithoutOrder: vi.fn(),
}));

vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(function () {
    return { giftCardsService, locationId: 'LOC-1' };
  }),
}));

const repos = vi.hoisted(() => ({
  GiftCardPurchaseRepository: { findByGiftCardId: vi.fn(), create: vi.fn() },
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
  issueGiftCard,
  issueGiftCardKeys,
  markClassCertificate,
} from './gift-card-admin-actions';

const secrets = { SQUARE_ACCESS_TOKEN: 't' };
const strings = { SQUARE_ENV: 'LOCAL', SQUARE_LOCATION_ID: 'LOC-1', SALES_TAX_RATE: '6' };
const context = { uid: 'admin-1' };
const pottery = { id: 'cat-pottery', name: 'Pottery', order: 1 };
const activeCard = {
  id: 'gc-1',
  last4: '1111',
  kind: 'egift' as const,
  state: 'active' as const,
  balanceCents: 2000,
  createdAt: '2026-11-02T15:00:00Z',
};
const FULL_CODE = '7783320000001111';

let logs: string[];
let errors: string[];

beforeEach(() => {
  vi.clearAllMocks();
  logs = [];
  errors = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.map(String).join(' '));
  });
  repos.GiftCardPurchaseRepository.create.mockImplementation(async (input) => ({
    ...input,
    createdAt: new Date('2026-11-08T12:00:00Z'),
  }));
});

afterEach(() => vi.restoreAllMocks());

describe('markClassCertificate', () => {
  const request = {
    giftCardId: 'gc-1',
    classCategoryId: 'cat-pottery',
    recipientName: '  Olive Thompson ',
    fromName: 'Robin Ashfield',
    message: '',
  };

  beforeEach(() => {
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockResolvedValue(undefined);
    repos.ClassCategoryRepository.findById.mockResolvedValue(pottery);
    giftCardsService.getGiftCard.mockResolvedValue(activeCard);
    giftCardsService.listCardHistory.mockResolvedValue([
      {
        id: 'a2',
        giftCardId: 'gc-1',
        type: 'redeem',
        amountCents: -4500,
        balanceAfterCents: 2000,
        createdAt: '2026-11-05T15:00:00Z',
      },
      {
        id: 'a1',
        giftCardId: 'gc-1',
        type: 'activate',
        amountCents: 6500,
        balanceAfterCents: 6500,
        createdAt: '2026-11-02T15:00:00Z',
      },
    ]);
  });

  it('records a register card as a class certificate at what was loaded, not the balance', async () => {
    const result = await markClassCertificate(request, context, secrets, strings);

    expect(giftCardsService.listCardHistory).toHaveBeenCalledWith('gc-1', '2026-11-02T15:00:00Z');
    expect(repos.GiftCardPurchaseRepository.create).toHaveBeenCalledWith({
      giftCardId: 'gc-1',
      last4: '1111',
      kind: 'class',
      valueCents: 6500,
      source: 'register',
      classCategoryId: 'cat-pottery',
      className: 'Pottery',
      recipientName: 'Olive Thompson',
      fromName: 'Robin Ashfield',
      message: undefined,
      recordedByUid: 'admin-1',
    });
    expect(result.purchase).toMatchObject({
      giftCardId: 'gc-1',
      kind: 'class',
      valueCents: 6500,
      source: 'register',
      classCategoryName: 'Pottery',
      createdAt: '2026-11-08T12:00:00.000Z',
    });
    expect(logs.map((l) => JSON.parse(l))).toContainEqual({
      event: 'gift_card_marked_class_certificate',
      giftCardId: 'gc-1',
      classCategoryId: 'cat-pottery',
      valueCents: 6500,
      uid: 'admin-1',
    });
  });

  it('validates before reading anything', async () => {
    await expect(
      markClassCertificate({ giftCardId: 'gc-1', classCategoryId: '' }, context, secrets, strings)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(repos.GiftCardPurchaseRepository.findByGiftCardId).not.toHaveBeenCalled();
    expect(giftCardsService.getGiftCard).not.toHaveBeenCalled();
  });

  it.each([
    [
      { kind: 'class', valueCents: 6500, source: 'register', className: 'Pottery' },
      'This card is already a $65 class certificate for Pottery.',
    ],
    [
      { kind: 'amount', valueCents: 5000 },
      "This card was bought online as a $50 gift card. It can't be changed.",
    ],
    [
      { kind: 'class', valueCents: 6500, source: 'online', className: 'Beginner Wheel' },
      "This card was bought online as a $65 class certificate for Beginner Wheel. It can't be changed.",
    ],
    [
      { kind: 'amount', valueCents: 2500, source: 'issued' },
      "This card was given free by the studio as a $25 gift card. It can't be changed.",
    ],
  ])('refuses a card that already has a record (%o)', async (existing, message) => {
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockResolvedValue({
      giftCardId: 'gc-1',
      last4: '1111',
      createdAt: new Date(),
      ...existing,
    });

    await expect(markClassCertificate(request, context, secrets, strings)).rejects.toMatchObject({
      code: 'failed-precondition',
      message,
    });
    expect(repos.GiftCardPurchaseRepository.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown class type', async () => {
    repos.ClassCategoryRepository.findById.mockResolvedValue(undefined);
    await expect(markClassCertificate(request, context, secrets, strings)).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(giftCardsService.getGiftCard).not.toHaveBeenCalled();
  });

  it('refuses an unknown card', async () => {
    giftCardsService.getGiftCard.mockResolvedValue(undefined);
    await expect(markClassCertificate(request, context, secrets, strings)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it.each(['pending', 'deactivated', 'blocked'])('refuses a %s card', async (state) => {
    giftCardsService.getGiftCard.mockResolvedValue({ ...activeCard, state });
    await expect(markClassCertificate(request, context, secrets, strings)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('Only an active card'),
    });
    expect(repos.GiftCardPurchaseRepository.create).not.toHaveBeenCalled();
  });

  it('refuses a card whose history shows no amount loaded', async () => {
    giftCardsService.listCardHistory.mockResolvedValue([]);
    await expect(markClassCertificate(request, context, secrets, strings)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining("doesn't show how much"),
    });
  });

  it('says what won when another click recorded the card first', async () => {
    repos.GiftCardPurchaseRepository.findByGiftCardId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        giftCardId: 'gc-1',
        last4: '1111',
        kind: 'class',
        valueCents: 6500,
        source: 'register',
        className: 'Pottery',
        createdAt: new Date(),
      });
    repos.GiftCardPurchaseRepository.create.mockRejectedValue(
      Object.assign(new Error('exists'), { code: 6 })
    );

    await expect(markClassCertificate(request, context, secrets, strings)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('already a $65 class certificate'),
    });
  });

  it('rethrows a write failure that is not a lost race', async () => {
    repos.GiftCardPurchaseRepository.create.mockRejectedValue(new Error('firestore down'));
    await expect(markClassCertificate(request, context, secrets, strings)).rejects.toThrow(
      'firestore down'
    );
  });
});

describe('issueGiftCard', () => {
  const amountRequest = {
    kind: 'amount' as const,
    amountCents: 2500,
    reason: '  Raffle prize at the fall fair  ',
    recipientName: 'Olive Thompson',
    fromName: 'Maple & Spruce',
    message: 'Congratulations!',
    idempotencyKey: 'issue-test-0001',
  };
  const keys = issueGiftCardKeys('issue-test-0001');

  beforeEach(() => {
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockResolvedValue(undefined);
    repos.ClassCategoryRepository.findById.mockResolvedValue(pottery);
    giftCardsService.createDigitalGiftCard.mockResolvedValue({
      id: 'gc-free',
      gan: FULL_CODE,
      last4: '1111',
    });
    giftCardsService.activateGiftCardWithoutOrder.mockResolvedValue({ balanceCents: 2500 });
  });

  it('uses a code the studio chose, without spaces or dashes and in capitals', async () => {
    await issueGiftCard({ ...amountRequest, code: 'fern reel-harp 4821' }, context, secrets, strings);
    expect(giftCardsService.createDigitalGiftCard).toHaveBeenCalledWith(
      expect.objectContaining({ gan: 'FERNREELHARP4821' })
    );
  });

  it("says when Square won't use a chosen code, and gives nothing", async () => {
    giftCardsService.createDigitalGiftCard.mockRejectedValueOnce(
      new Error('Square could not create gift card: A gift card with that GAN already exists.')
    );
    await expect(
      issueGiftCard({ ...amountRequest, code: 'FERNREELHARP4821' }, context, secrets, strings)
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining('already exists'),
    });
    expect(giftCardsService.activateGiftCardWithoutOrder).not.toHaveBeenCalled();
  });

  it('refuses a malformed chosen code before touching Square', async () => {
    await expect(
      issueGiftCard({ ...amountRequest, code: '4111 1111' }, context, secrets, strings)
    ).rejects.toBeTruthy();
    expect(giftCardsService.createDigitalGiftCard).not.toHaveBeenCalled();
  });

  it('derives stable Square keys and a short comp reference from the dialog key', () => {
    expect(issueGiftCardKeys('issue-test-0001')).toEqual(keys);
    expect(keys.referenceId).toMatch(/^comp-[0-9a-f]{12}$/);
    expect(keys.create).not.toEqual(keys.activate);
    expect(keys.create.length).toBeLessThanOrEqual(128);
    expect(issueGiftCardKeys('issue-test-0002').create).not.toEqual(keys.create);
  });

  it('makes a card, loads it without an order, records why, and never returns or logs the code', async () => {
    const result = await issueGiftCard(amountRequest, context, secrets, strings);

    expect(giftCardsService.createDigitalGiftCard).toHaveBeenCalledWith({
      locationId: 'LOC-1',
      idempotencyKey: keys.create,
      gan: undefined,
    });
    expect(giftCardsService.activateGiftCardWithoutOrder).toHaveBeenCalledWith({
      giftCardId: 'gc-free',
      locationId: 'LOC-1',
      amountCents: 2500,
      referenceId: keys.referenceId,
      buyerPaymentInstrumentIds: [keys.referenceId],
      idempotencyKey: keys.activate,
    });
    expect(repos.GiftCardPurchaseRepository.create).toHaveBeenCalledWith({
      giftCardId: 'gc-free',
      last4: '1111',
      kind: 'amount',
      valueCents: 2500,
      source: 'issued',
      classCategoryId: undefined,
      className: undefined,
      recipientName: 'Olive Thompson',
      fromName: 'Maple & Spruce',
      message: 'Congratulations!',
      reason: 'Raffle prize at the fall fair',
      recordedByUid: 'admin-1',
    });
    expect(result).toEqual({
      giftCardId: 'gc-free',
      last4: '1111',
      kind: 'amount',
      valueCents: 2500,
      className: undefined,
      recorded: true,
    });
    expect(JSON.stringify(result)).not.toContain(FULL_CODE);

    const issued = logs.map((l) => JSON.parse(l)).find((l) => l.event === 'gift_card_issued');
    expect(issued).toMatchObject({
      giftCardId: 'gc-free',
      valueCents: 2500,
      uid: 'admin-1',
      reason: 'Raffle prize at the fall fair',
    });
    expect([...logs, ...errors].join('\n')).not.toContain(FULL_CODE);
  });

  it('a class certificate uses the value Katie entered and the class type', async () => {
    const result = await issueGiftCard(
      {
        kind: 'class',
        classCategoryId: 'cat-pottery',
        valueCents: 6500,
        reason: 'Instructor thank-you',
        idempotencyKey: 'issue-test-0003',
      },
      context,
      secrets,
      strings
    );

    expect(giftCardsService.activateGiftCardWithoutOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 6500 })
    );
    expect(repos.GiftCardPurchaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'class',
        valueCents: 6500,
        classCategoryId: 'cat-pottery',
        className: 'Pottery',
        source: 'issued',
        recipientName: undefined,
      })
    );
    expect(result).toMatchObject({ kind: 'class', valueCents: 6500, className: 'Pottery' });
  });

  it('validates before any Square call', async () => {
    await expect(
      issueGiftCard({ ...amountRequest, amountCents: 60000 }, context, secrets, strings)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      issueGiftCard({ ...amountRequest, reason: 'no' }, context, secrets, strings)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(giftCardsService.createDigitalGiftCard).not.toHaveBeenCalled();
  });

  it('refuses an unknown class type before any Square call', async () => {
    repos.ClassCategoryRepository.findById.mockResolvedValue(undefined);
    await expect(
      issueGiftCard(
        {
          kind: 'class',
          classCategoryId: 'gone',
          valueCents: 6500,
          reason: 'Thank-you',
          idempotencyKey: 'issue-test-0004',
        },
        context,
        secrets,
        strings
      )
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(giftCardsService.createDigitalGiftCard).not.toHaveBeenCalled();
  });

  it('a retry of a finished issue returns the same card without loading it again', async () => {
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockResolvedValue({
      giftCardId: 'gc-free',
      last4: '1111',
      kind: 'amount',
      valueCents: 2500,
      source: 'issued',
      createdAt: new Date(),
    });

    const result = await issueGiftCard(amountRequest, context, secrets, strings);

    expect(result).toMatchObject({ giftCardId: 'gc-free', valueCents: 2500, recorded: true });
    expect(giftCardsService.activateGiftCardWithoutOrder).not.toHaveBeenCalled();
    expect(repos.GiftCardPurchaseRepository.create).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('gift_card_issue_retried');
  });

  it('says nothing was given when Square cannot make the card', async () => {
    giftCardsService.createDigitalGiftCard.mockRejectedValue(new Error('Square down'));

    await expect(issueGiftCard(amountRequest, context, secrets, strings)).rejects.toThrow(
      'Nothing was given'
    );
    expect(errors.join('\n')).toContain('"step":"create"');
    expect(repos.GiftCardPurchaseRepository.create).not.toHaveBeenCalled();
  });

  it('says nothing was given when Square cannot load the card, and records nothing', async () => {
    giftCardsService.activateGiftCardWithoutOrder.mockRejectedValue(new Error('INVALID_VALUE'));

    await expect(issueGiftCard(amountRequest, context, secrets, strings)).rejects.toThrow(
      'nothing was given'
    );
    expect(errors.join('\n')).toContain('"step":"activate"');
    expect(repos.GiftCardPurchaseRepository.create).not.toHaveBeenCalled();
    expect(logs.join('\n')).not.toContain('gift_card_issued');
  });

  it('still returns the live card when only our record fails, flagged as not recorded', async () => {
    repos.GiftCardPurchaseRepository.create.mockRejectedValue(new Error('firestore down'));

    const result = await issueGiftCard(amountRequest, context, secrets, strings);

    expect(result).toMatchObject({ giftCardId: 'gc-free', recorded: false });
    expect(errors.join('\n')).toContain('gift_card_issue_record_failed');
    expect(logs.join('\n')).toContain('gift_card_issued');
  });

  it('logs a null uid when there is none', async () => {
    await issueGiftCard(amountRequest, {}, secrets, strings);
    const issued = logs.map((l) => JSON.parse(l)).find((l) => l.event === 'gift_card_issued');
    expect(issued.uid).toBeNull();
  });
});
