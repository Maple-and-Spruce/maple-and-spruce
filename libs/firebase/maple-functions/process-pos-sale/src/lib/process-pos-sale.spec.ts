import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for processPosSale — the Firestore-triggered worker that turns a
 * completed in-person Square POS class sale into a source:'pos' registration.
 *
 * Covers: web-order dedup, squareOrderId idempotency, customer-with-email and
 * customer-without-email (admin alert) creation, non-class line items,
 * already-processed early-return, and the markFailed+rethrow error path.
 */

const mocks = vi.hoisted(() => ({
  onDocumentWritten: vi.fn(),
  // PosSaleRequestRepository
  markProcessed: vi.fn(),
  markFailed: vi.fn(),
  // RegistrationRepository
  findById: vi.fn(),
  findBySquareOrderId: vi.fn(),
  createRegistration: vi.fn(),
  txnUpdate: vi.fn(),
  // Transactional re-read state for the hosted-checkout reconciliation.
  freshReg: undefined as Record<string, unknown> | undefined,
  countDocs: [] as Array<{ data: () => Record<string, unknown> }>,
  // Helpers extracted so the mock's arrow nesting stays shallow (sonarjs).
  snap: (value: Record<string, unknown> | undefined) => ({
    data: () => value,
  }),
  whereStub: () => ({ where: () => ({ __query: true }) }),
  // ClassRepository
  findBySquareVariationId: vi.fn(),
  classFindById: vi.fn(),
  // PosLessonConfigRepository
  getLessonCatalogObjectIds: vi.fn(),
  // PosLessonAttributionRepository
  attrFindById: vi.fn(),
  attrCapture: vi.fn(),
  // StudentRepository
  findByPrimaryContactEmail: vi.fn(),
  // InvoiceRepository
  settleOrCreatePosLessonInvoice: vi.fn(),
  // Square services
  getPayment: vi.fn(),
  getOrder: vi.fn(),
  getCustomer: vi.fn(),
  // mail collection
  mailAdd: vi.fn(),
  // The buyer's confirmation email (shared helper)
  queueRegistrationConfirmation: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  queueRegistrationConfirmation: mocks.queueRegistrationConfirmation,
  generateConfirmationNumber: () => 'MS-POS001',
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((config, handler) => {
    mocks.onDocumentWritten(config, handler);
    return handler;
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => '__DELETE__' },
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

vi.mock('@maple/firebase/database', () => ({
  getDb: () => ({
    collection: vi.fn(() => ({
      add: mocks.mailAdd,
      // Capacity re-count query used inside the reconciliation transaction.
      where: mocks.whereStub,
    })),
    runTransaction: async (
      cb: (txn: {
        get: (arg: unknown) => Promise<{
          data?: () => Record<string, unknown> | undefined;
          docs?: Array<{ data: () => Record<string, unknown> }>;
        }>;
        update: (ref: unknown, data: unknown) => void;
      }) => Promise<unknown>
    ) => {
      const txn = {
        get: async (arg: unknown) =>
          arg && (arg as { __query?: boolean }).__query
            ? { docs: mocks.countDocs }
            : mocks.snap(mocks.freshReg),
        update: mocks.txnUpdate,
      };
      return cb(txn);
    },
  }),
  PosSaleRequestRepository: {
    markProcessed: mocks.markProcessed,
    markFailed: mocks.markFailed,
  },
  RegistrationRepository: {
    findById: mocks.findById,
    findBySquareOrderId: mocks.findBySquareOrderId,
    create: mocks.createRegistration,
    getDocRef: (id: string) => ({ id }),
  },
  ClassRepository: {
    findBySquareVariationId: mocks.findBySquareVariationId,
    findById: mocks.classFindById,
  },
  PosLessonConfigRepository: {
    getLessonCatalogObjectIds: mocks.getLessonCatalogObjectIds,
  },
  PosLessonAttributionRepository: {
    findById: mocks.attrFindById,
    capture: mocks.attrCapture,
  },
  StudentRepository: {
    findByPrimaryContactEmail: mocks.findByPrimaryContactEmail,
  },
  InvoiceRepository: {
    settleOrCreatePosLessonInvoice: mocks.settleOrCreatePosLessonInvoice,
  },
  posLessonAttributionId: (paymentId: string, catalogObjectId: string) =>
    `${paymentId}__${catalogObjectId}`,
}));

vi.mock('@maple/firebase/square', () => ({
  Square: class MockSquare {
    taxRatePercent = 6;
    paymentsService = { getPayment: mocks.getPayment };
    ordersService = { getOrder: mocks.getOrder };
    customersService = { get: mocks.getCustomer };
  },
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'] as const,
  SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID'] as const,
}));

vi.mock('@maple/ts/domain', async (importOriginal) => ({
  // The real gift certificate name check (#314), so the spec proves the
  // worker's actual matching rule rather than a stand-in.
  isGiftCertificateLineItem: (
    await importOriginal<typeof import('@maple/ts/domain')>()
  ).isGiftCertificateLineItem,
  calculateTax: (subtotalCents: number, taxRatePercent: number) => {
    const taxAmountCents = Math.round(subtotalCents * (taxRatePercent / 100));
    return { taxAmountCents, totalCents: subtotalCents + taxAmountCents };
  },
}));

import { processPosSale } from './process-pos-sale';

type Handler = (event: unknown) => Promise<void>;
const handler = processPosSale as unknown as Handler;

function makeEvent(
  after: Record<string, unknown> | undefined,
  paymentId = 'PAY-1'
): unknown {
  return {
    data: { after: { data: () => after } },
    params: { paymentId },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults — most tests override.
  mocks.getPayment.mockResolvedValue({
    paymentId: 'PAY-1',
    status: 'COMPLETED',
    orderId: 'ORDER-1',
    customerId: undefined,
    receiptUrl: 'https://squareup.com/receipt/pos',
  });
  mocks.getOrder.mockResolvedValue({
    orderId: 'ORDER-1',
    referenceId: undefined,
    customerId: undefined,
    totalCents: 4770,
    lineItems: [
      { catalogObjectId: 'VAR_A', name: 'Pottery 101', quantity: 1 },
    ],
  });
  mocks.findById.mockResolvedValue(undefined);
  mocks.findBySquareOrderId.mockResolvedValue(undefined);
  mocks.findBySquareVariationId.mockResolvedValue({
    id: 'class-1',
    name: 'Pottery 101',
    priceCents: 4500,
  });
  mocks.createRegistration.mockResolvedValue({ id: 'reg-new' });
  // Lesson defaults: no configured lesson items → lesson path never fires for
  // the class/registration tests above.
  mocks.getLessonCatalogObjectIds.mockResolvedValue([]);
  mocks.attrFindById.mockResolvedValue(undefined);
  mocks.attrCapture.mockResolvedValue({ id: 'attr-1' });
  mocks.findByPrimaryContactEmail.mockResolvedValue([]);
  mocks.settleOrCreatePosLessonInvoice.mockResolvedValue({
    invoice: { id: 'inv-pos-1' },
    settledExisting: false,
  });
  mocks.classFindById.mockResolvedValue({ id: 'class-1', capacity: 10 });
  mocks.freshReg = undefined;
  mocks.countDocs = [];
  mocks.queueRegistrationConfirmation.mockResolvedValue({ queued: 1 });
});

describe('processPosSale — early exits', () => {
  it('returns without work when the doc was deleted (no after data)', async () => {
    await handler(makeEvent(undefined));
    expect(mocks.getPayment).not.toHaveBeenCalled();
    expect(mocks.markProcessed).not.toHaveBeenCalled();
  });

  it('returns immediately when the doc is already processed', async () => {
    await handler(makeEvent({ processedAt: new Date(), orderId: 'ORDER-1' }));
    expect(mocks.getPayment).not.toHaveBeenCalled();
    expect(mocks.createRegistration).not.toHaveBeenCalled();
  });

  it('marks processed without creating when payment is not COMPLETED', async () => {
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'APPROVED',
    });
    await handler(makeEvent({ orderId: 'ORDER-1' }));
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('marks processed without creating when there is no order id', async () => {
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'COMPLETED',
      orderId: undefined,
    });
    await handler(makeEvent({})); // no orderId fallback on the doc either
    expect(mocks.getOrder).not.toHaveBeenCalled();
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });
});

describe('processPosSale — dedup', () => {
  it('skips an already-confirmed web order (inline card flow) — no create, no re-update', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      referenceId: 'reg-web-abc',
      lineItems: [{ catalogObjectId: 'VAR_A', quantity: 1 }],
    });
    mocks.findById.mockResolvedValue({
      id: 'reg-web-abc',
      source: 'web',
      status: 'confirmed',
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findById).toHaveBeenCalledWith('reg-web-abc');
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.txnUpdate).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('confirms a pending hosted-checkout registration (referenceId → pending web reg)', async () => {
    mocks.getPayment.mockResolvedValue({
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      receiptUrl: 'https://squareup.com/receipt/xyz',
    });
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      referenceId: 'reg-hosted-1',
      lineItems: [{ catalogObjectId: 'VAR_A', quantity: 1 }],
    });
    mocks.findById.mockResolvedValue({
      id: 'reg-hosted-1',
      source: 'web',
      status: 'pending',
      classId: 'class-1',
      quantity: 1,
    });
    // Transactional re-read still sees it pending.
    mocks.freshReg = { status: 'pending' };

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    // Flipped pending → confirmed with the Square payment ids — NOT a new POS reg.
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.txnUpdate).toHaveBeenCalledWith(
      { id: 'reg-hosted-1' },
      expect.objectContaining({
        status: 'confirmed',
        squarePaymentId: 'PAY-1',
        squareOrderId: 'ORDER-1',
        squareReceiptUrl: 'https://squareup.com/receipt/xyz',
      })
    );
    // No capacity re-check / overbook alert for a pending hold.
    expect(mocks.mailAdd).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('emails the buyer the same confirmation the card checkout sends', async () => {
    const slotStart = new Date('2030-06-15T14:00:00.000Z');
    const attendees = [{ name: 'Friend One', email: 'friend@example.com' }];
    mocks.getPayment.mockResolvedValue({
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      receiptUrl: 'https://squareup.com/receipt/xyz',
    });
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      referenceId: 'reg-hosted-1',
      lineItems: [{ catalogObjectId: 'VAR_A', quantity: 2 }],
    });
    mocks.findById.mockResolvedValue({
      id: 'reg-hosted-1',
      source: 'web',
      status: 'pending',
      classId: 'class-1',
      customerName: 'Robin Ashfield',
      customerEmail: 'robin@example.com',
      quantity: 2,
      additionalAttendees: attendees,
      slotStart,
      confirmationNumber: 'MS-HOST01',
      subtotalCents: 9000,
      taxRatePercent: 6,
      taxAmountCents: 540,
      pricePaidCents: 9540,
    });
    mocks.freshReg = { status: 'pending' };
    const classEntity = { id: 'class-1', name: 'Pottery 101', capacity: 10 };
    mocks.classFindById.mockResolvedValue(classEntity);

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.queueRegistrationConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.queueRegistrationConfirmation).toHaveBeenCalledWith({
      idempotencyKey: 'reg-hosted-1',
      classEntity,
      customerName: 'Robin Ashfield',
      customerEmail: 'robin@example.com',
      quantity: 2,
      confirmationNumber: 'MS-HOST01',
      slotStart,
      additionalAttendees: attendees,
      subtotalCents: 9000,
      taxRatePercent: 6,
      taxAmountCents: 540,
      amountPaidCents: 9540,
      receiptUrl: 'https://squareup.com/receipt/xyz',
    });
  });

  it('sends no second confirmation when a retry finds it already confirmed', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      referenceId: 'reg-hosted-2',
      lineItems: [{ catalogObjectId: 'VAR_A', quantity: 1 }],
    });
    mocks.findById.mockResolvedValue({
      id: 'reg-hosted-2',
      source: 'web',
      status: 'pending',
      classId: 'class-1',
      customerEmail: 'robin@example.com',
      quantity: 1,
    });
    mocks.freshReg = { status: 'confirmed', squarePaymentId: 'PAY-1' };

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.queueRegistrationConfirmation).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('sends no confirmation for an already-confirmed card checkout', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      referenceId: 'reg-web-1',
      lineItems: [{ catalogObjectId: 'VAR_A', quantity: 1 }],
    });
    mocks.findById.mockResolvedValue({
      id: 'reg-web-1',
      source: 'web',
      status: 'confirmed',
      classId: 'class-1',
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    // createRegistration already emailed this buyer.
    expect(mocks.queueRegistrationConfirmation).not.toHaveBeenCalled();
  });

  it('is idempotent: does not re-confirm when the transactional re-read is already confirmed', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      referenceId: 'reg-hosted-2',
      lineItems: [{ catalogObjectId: 'VAR_A', quantity: 1 }],
    });
    // Query-time snapshot saw pending, but a prior worker run already confirmed.
    mocks.findById.mockResolvedValue({
      id: 'reg-hosted-2',
      source: 'web',
      status: 'pending',
      classId: 'class-1',
      quantity: 1,
    });
    mocks.freshReg = { status: 'confirmed', squarePaymentId: 'PAY-0' };

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.txnUpdate).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('honors a late payment on a reaper-cancelled hold but alerts staff when it overbooks', async () => {
    mocks.getPayment.mockResolvedValue({
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      receiptUrl: 'https://squareup.com/receipt/late',
    });
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      referenceId: 'reg-hosted-3',
      lineItems: [{ catalogObjectId: 'VAR_A', quantity: 1 }],
    });
    mocks.findById.mockResolvedValue({
      id: 'reg-hosted-3',
      source: 'web',
      status: 'cancelled', // reaper released the hold
      classId: 'class-1',
      quantity: 1,
    });
    mocks.freshReg = { status: 'cancelled' };
    // Capacity 1, and the freed spot was already resold (1 taken).
    mocks.classFindById.mockResolvedValue({ id: 'class-1', capacity: 1 });
    mocks.countDocs = [{ data: () => ({ quantity: 1 }) }];

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    // Still confirmed (honor the payment)...
    expect(mocks.txnUpdate).toHaveBeenCalledWith(
      { id: 'reg-hosted-3' },
      expect.objectContaining({ status: 'confirmed' })
    );
    // ...but staff are alerted to the overbooking.
    expect(mocks.mailAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          subject: expect.stringMatching(/overbooked/i),
        }),
      })
    );
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  describe('a late payment on a reaper-cancelled private hour', () => {
    const HOUR_10 = new Date('2030-06-15T14:00:00.000Z');
    const HOUR_11 = new Date('2030-06-15T15:00:00.000Z');

    function cancelledHourHold() {
      mocks.getOrder.mockResolvedValue({
        orderId: 'ORDER-1',
        referenceId: 'reg-hour-1',
        lineItems: [{ catalogObjectId: 'VAR_PH', quantity: 1 }],
      });
      mocks.findById.mockResolvedValue({
        id: 'reg-hour-1',
        source: 'web',
        status: 'cancelled',
        classId: 'class-ph',
        quantity: 1,
        slotStart: HOUR_10,
        groupSize: 6,
      });
      mocks.freshReg = { status: 'cancelled' };
      // `capacity` is the largest group, not a count of bookings.
      mocks.classFindById.mockResolvedValue({ id: 'class-ph', capacity: 8 });
    }

    const outcomeLogged = (outcome: string) =>
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`registration reg-hour-1 (was cancelled) → ${outcome}`)
      );

    let logSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => {
      logSpy.mockRestore();
    });

    it('is overbooked when another active registration holds the same hour (Timestamp)', async () => {
      cancelledHourHold();
      mocks.countDocs = [
        { data: () => ({ quantity: 1, slotStart: { toDate: () => new Date(HOUR_10) } }) },
      ];

      await handler(makeEvent({ orderId: 'ORDER-1' }));

      expect(mocks.txnUpdate).toHaveBeenCalledWith(
        { id: 'reg-hour-1' },
        expect.objectContaining({ status: 'confirmed' })
      );
      outcomeLogged('overbooked');
      expect(mocks.mailAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            subject: expect.stringMatching(/overbooked/i),
          }),
        })
      );
    });

    it('is overbooked when the same hour is held as a plain Date', async () => {
      cancelledHourHold();
      mocks.countDocs = [{ data: () => ({ quantity: 1, slotStart: new Date(HOUR_10) }) }];

      await handler(makeEvent({ orderId: 'ORDER-1' }));

      outcomeLogged('overbooked');
      expect(mocks.mailAdd).toHaveBeenCalled();
    });

    it('is confirmed when the hour is free, however many other hours are booked', async () => {
      cancelledHourHold();
      // More active bookings than `capacity`: a seat count would call this
      // overbooked, but each one holds a different hour.
      mocks.countDocs = Array.from({ length: 10 }, (_, i) => ({
        data: () => ({
          quantity: 1,
          slotStart: { toDate: () => new Date(HOUR_11.getTime() + i * 3_600_000) },
        }),
      }));

      await handler(makeEvent({ orderId: 'ORDER-1' }));

      expect(mocks.txnUpdate).toHaveBeenCalledWith(
        { id: 'reg-hour-1' },
        expect.objectContaining({ status: 'confirmed' })
      );
      outcomeLogged('confirmed');
      expect(mocks.mailAdd).not.toHaveBeenCalled();
    });
  });

  it('confirms a cancelled seat hold without alerting when seats remain', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      referenceId: 'reg-hosted-4',
      lineItems: [{ catalogObjectId: 'VAR_A', quantity: 2 }],
    });
    mocks.findById.mockResolvedValue({
      id: 'reg-hosted-4',
      source: 'web',
      status: 'cancelled',
      classId: 'class-1',
      quantity: 2,
    });
    mocks.freshReg = { status: 'cancelled' };
    mocks.classFindById.mockResolvedValue({ id: 'class-1', capacity: 3 });
    mocks.countDocs = [{ data: () => ({ quantity: 1 }) }];

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.txnUpdate).toHaveBeenCalledWith(
      { id: 'reg-hosted-4' },
      expect.objectContaining({ status: 'confirmed' })
    );
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('skips an order already turned into a registration (squareOrderId idempotency)', async () => {
    mocks.findBySquareOrderId.mockResolvedValue({ id: 'reg-existing' });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findBySquareOrderId).toHaveBeenCalledWith('ORDER-1');
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });
});

describe('processPosSale — registration creation', () => {
  it('creates a source:pos registration with the customer email, no admin alert', async () => {
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      customerId: 'cust-1',
      receiptUrl: 'https://squareup.com/receipt/pos',
    });
    mocks.getCustomer.mockResolvedValue({
      emailAddress: 'buyer@example.com',
      givenName: 'Grace',
      familyName: 'Hopper',
    });
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [{ catalogObjectId: 'VAR_A', name: 'Pottery 101', quantity: 2 }],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.createRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        customerEmail: 'buyer@example.com',
        customerName: 'Grace Hopper',
        quantity: 2,
        source: 'pos',
        status: 'confirmed',
        squareOrderId: 'ORDER-1',
        squarePaymentId: 'PAY-1',
        squareReceiptUrl: 'https://squareup.com/receipt/pos',
        // 4500 * 2 = 9000 subtotal, 6% tax = 540, total 9540
        subtotalCents: 9000,
        taxAmountCents: 540,
        taxRatePercent: 6,
        pricePaidCents: 9540,
      })
    );
    expect(mocks.mailAdd).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('emails the buyer a confirmation, keyed so a re-run cannot send twice', async () => {
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      customerId: 'cust-1',
      receiptUrl: 'https://squareup.com/receipt/pos',
    });
    mocks.getCustomer.mockResolvedValue({
      emailAddress: 'buyer@example.com',
      givenName: 'Grace',
      familyName: 'Hopper',
    });
    const classEntity = { id: 'class-1', name: 'Pottery 101', priceCents: 4500 };
    mocks.findBySquareVariationId.mockResolvedValue(classEntity);
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [
        { catalogObjectId: 'RETAIL', name: 'Mug', quantity: 1 },
        { catalogObjectId: 'VAR_A', name: 'Pottery 101', quantity: 2 },
      ],
    });
    mocks.findBySquareVariationId.mockImplementation(async (id: string) =>
      id === 'VAR_A' ? classEntity : undefined
    );

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    // The registration carries the number the email quotes.
    expect(mocks.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationNumber: 'MS-POS001' })
    );
    expect(mocks.queueRegistrationConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.queueRegistrationConfirmation).toHaveBeenCalledWith({
      // Payment + line index: the class is the second line.
      idempotencyKey: 'pos-PAY-1-1',
      classEntity,
      customerName: 'Grace Hopper',
      customerEmail: 'buyer@example.com',
      quantity: 2,
      confirmationNumber: 'MS-POS001',
      subtotalCents: 9000,
      taxRatePercent: 6,
      taxAmountCents: 540,
      amountPaidCents: 9540,
      receiptUrl: 'https://squareup.com/receipt/pos',
    });
  });

  it('prefers the actual Square line-item money (grossSales/tax/total) over reconstruction', async () => {
    // Simulate a POS discount / price override: the class list price is 4500
    // but Square actually charged a discounted 3500 subtotal, 210 tax, 3710
    // total. The registration must reflect Square's real numbers, NOT the
    // reconstructed 4500*1 + 6% = 4770.
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      customerId: 'cust-1',
      receiptUrl: 'https://squareup.com/receipt/pos',
    });
    mocks.getCustomer.mockResolvedValue({
      emailAddress: 'buyer@example.com',
      givenName: 'Ada',
      familyName: 'Lovelace',
    });
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [
        {
          catalogObjectId: 'VAR_A',
          name: 'Pottery 101',
          quantity: 1,
          basePriceCents: 4500,
          grossSalesCents: 3500,
          totalTaxCents: 210,
          totalCents: 3710,
        },
      ],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.createRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        source: 'pos',
        // Exact Square amounts, not the 4500/270/4770 reconstruction.
        subtotalCents: 3500,
        taxAmountCents: 210,
        pricePaidCents: 3710,
        // taxRatePercent stays the configured rate for reporting.
        taxRatePercent: 6,
      })
    );
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('creates a placeholder registration and emails the admin when there is no email', async () => {
    // No customer id → no email resolved.
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      customerId: undefined,
      receiptUrl: 'https://squareup.com/receipt/pos',
    });
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [{ catalogObjectId: 'VAR_A', name: 'Pottery 101', quantity: 1 }],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: '',
        customerName: 'POS Sale',
        source: 'pos',
      })
    );
    expect(mocks.getCustomer).not.toHaveBeenCalled();
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
    const mailDoc = mocks.mailAdd.mock.calls[0][0];
    // Recipient now comes from the ADMIN_ALERT_EMAIL param; the params mock
    // returns `mock-<NAME>`, proving the alert reads the env-configured value.
    expect(mailDoc.to).toBe('mock-ADMIN_ALERT_EMAIL');
    expect(mailDoc.message.subject).toMatch(/needs an attendee email/i);
    expect(mailDoc.message.text).toContain('ORDER-1');
    // Nobody to confirm to.
    expect(mocks.queueRegistrationConfirmation).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('creates no registration for a line item that maps to no class', async () => {
    mocks.findBySquareVariationId.mockResolvedValue(undefined);
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [{ catalogObjectId: 'VAR_RETAIL', name: 'A mug', quantity: 1 }],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('skips line items with no catalogObjectId', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [{ name: 'Custom amount', quantity: 1 }],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findBySquareVariationId).not.toHaveBeenCalled();
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });
});

describe('processPosSale — lesson attribution', () => {
  const lessonLine = {
    catalogObjectId: 'VAR_LESSON',
    name: 'Guitar Lesson',
    quantity: 1,
    basePriceCents: 3000,
    grossSalesCents: 3000,
    totalTaxCents: 0,
    totalCents: 3000,
  };

  beforeEach(() => {
    // Configure VAR_LESSON as a lesson item; it is NOT a class.
    mocks.getLessonCatalogObjectIds.mockResolvedValue(['VAR_LESSON']);
    mocks.findBySquareVariationId.mockResolvedValue(undefined);
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      customerId: 'cust-1',
      receiptUrl: 'https://squareup.com/receipt/pos',
      createdAt: '2026-07-17T15:00:00Z',
    });
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [lessonLine],
    });
    mocks.getCustomer.mockResolvedValue({
      emailAddress: 'parent@example.com',
      givenName: 'Casey',
      familyName: 'Nguyen',
    });
  });

  it('auto-attributes when the customer email maps to exactly one student', async () => {
    mocks.findByPrimaryContactEmail.mockResolvedValue([{ id: 'student-1' }]);
    mocks.settleOrCreatePosLessonInvoice.mockResolvedValue({
      invoice: { id: 'inv-9' },
      settledExisting: true,
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.settleOrCreatePosLessonInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        subtotalCents: 3000,
        squarePaymentId: 'PAY-1',
        squareOrderId: 'ORDER-1',
      })
    );
    expect(mocks.attrCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogObjectId: 'VAR_LESSON',
        itemName: 'Guitar Lesson',
        subtotalCents: 3000,
        amountPaidCents: 3000,
        customerEmail: 'parent@example.com',
      }),
      expect.objectContaining({
        status: 'attributed',
        studentId: 'student-1',
        invoiceId: 'inv-9',
        attributedBy: 'auto',
      })
    );
    expect(mocks.mailAdd).not.toHaveBeenCalled();
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('queues (pending) + emails when the email matches no student', async () => {
    mocks.findByPrimaryContactEmail.mockResolvedValue([]);

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.settleOrCreatePosLessonInvoice).not.toHaveBeenCalled();
    expect(mocks.attrCapture).toHaveBeenCalledTimes(1);
    // Second arg (attribution) omitted → captured as pending.
    expect(mocks.attrCapture.mock.calls[0][1]).toBeUndefined();
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
    expect(mocks.mailAdd.mock.calls[0][0].message.subject).toMatch(
      /needs attribution/i
    );
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('queues (does not auto-attribute) when siblings share the parent email', async () => {
    mocks.findByPrimaryContactEmail.mockResolvedValue([
      { id: 'student-a' },
      { id: 'student-b' },
    ]);

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.settleOrCreatePosLessonInvoice).not.toHaveBeenCalled();
    expect(mocks.attrCapture.mock.calls[0][1]).toBeUndefined();
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
  });

  it('queues when the sale carried no customer email', async () => {
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      customerId: undefined,
      createdAt: '2026-07-17T15:00:00Z',
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findByPrimaryContactEmail).not.toHaveBeenCalled();
    expect(mocks.settleOrCreatePosLessonInvoice).not.toHaveBeenCalled();
    expect(mocks.attrCapture.mock.calls[0][1]).toBeUndefined();
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — skips a line item already captured', async () => {
    mocks.attrFindById.mockResolvedValue({ id: 'PAY-1__VAR_LESSON' });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.attrCapture).not.toHaveBeenCalled();
    expect(mocks.settleOrCreatePosLessonInvoice).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('ignores a line item that is neither a class nor a configured lesson', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [{ catalogObjectId: 'VAR_RETAIL', name: 'A mug', quantity: 1 }],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.attrCapture).not.toHaveBeenCalled();
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });
});

describe('processPosSale — gift cards', () => {
  // Square's own line-item shape for a gift card sold at the register or as an
  // eGift card online. Some gift card lines carry a catalog id, so the skip
  // must not depend on the id being absent.
  const giftCardLine = {
    catalogObjectId: 'VAR_GIFT_CARD',
    itemType: 'GIFT_CARD',
    name: 'Gift Card',
    quantity: 1,
    grossSalesCents: 5000,
    totalTaxCents: 0,
    totalCents: 5000,
  };

  it('ignores a gift card sale: no registration, lesson attribution or alert', async () => {
    // Even if the gift card's catalog id were configured as a lesson item or
    // resolved to a class, a gift card line must never be treated as one.
    mocks.getLessonCatalogObjectIds.mockResolvedValue(['VAR_GIFT_CARD']);
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [giftCardLine],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findBySquareVariationId).not.toHaveBeenCalled();
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.attrCapture).not.toHaveBeenCalled();
    expect(mocks.settleOrCreatePosLessonInvoice).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('records only the class on a mixed order (gift card + class)', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [
        giftCardLine,
        { catalogObjectId: 'VAR_A', name: 'Pottery 101', quantity: 1 },
      ],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findBySquareVariationId).toHaveBeenCalledTimes(1);
    expect(mocks.findBySquareVariationId).toHaveBeenCalledWith('VAR_A');
    expect(mocks.createRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        quantity: 1,
        // Only the class line's money, never the gift card's $50.
        subtotalCents: 4500,
        pricePaidCents: 4770,
      })
    );
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  });

  it('records only the lesson on a mixed order (gift card + lesson)', async () => {
    mocks.getLessonCatalogObjectIds.mockResolvedValue(['VAR_LESSON']);
    mocks.findBySquareVariationId.mockResolvedValue(undefined);
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [
        giftCardLine,
        {
          catalogObjectId: 'VAR_LESSON',
          name: 'Guitar Lesson',
          quantity: 1,
          grossSalesCents: 3000,
          totalCents: 3000,
        },
      ],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.attrCapture).toHaveBeenCalledTimes(1);
    expect(mocks.attrCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogObjectId: 'VAR_LESSON',
        subtotalCents: 3000,
        amountPaidCents: 3000,
      })
    );
  });

  it('registers a class PAID with a gift card exactly like a card payment', async () => {
    // Spending a gift card shows up as the payment source, not a line item.
    // The worker reads neither the source type nor card details, so the
    // registration is identical to a card sale.
    mocks.getPayment.mockResolvedValue({
      paymentId: 'PAY-1',
      status: 'COMPLETED',
      orderId: 'ORDER-1',
      customerId: undefined,
      receiptUrl: 'https://squareup.com/receipt/pos',
      sourceType: 'SQUARE_GIFT_CARD',
    });
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [
        {
          catalogObjectId: 'VAR_A',
          itemType: 'ITEM',
          name: 'Pottery 101',
          quantity: 1,
        },
      ],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.createRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        source: 'pos',
        status: 'confirmed',
        squarePaymentId: 'PAY-1',
        subtotalCents: 4500,
        pricePaidCents: 4770,
      })
    );
  });
});

describe('processPosSale — gift certificates (#314)', () => {
  // A printed, pre-loaded gift certificate is sold by ringing up a hand-made
  // "Gift certificate" catalog item with a typed (variable) price and no tax.
  // That money loads a gift card: it is never a class, a lesson or an
  // artist's sale. Its catalog id maps to nothing of ours.
  const certificateLine = {
    catalogObjectId: 'VAR_GIFT_CERTIFICATE',
    itemType: 'ITEM',
    name: 'Gift certificate',
    quantity: 1,
    basePriceCents: 7500,
    grossSalesCents: 7500,
    totalTaxCents: 0,
    totalCents: 7500,
  };

  function expectNothingRecorded(): void {
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.attrCapture).not.toHaveBeenCalled();
    expect(mocks.settleOrCreatePosLessonInvoice).not.toHaveBeenCalled();
    expect(mocks.findByPrimaryContactEmail).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
  }

  it('ignores an unmapped "Gift certificate" catalog item', async () => {
    mocks.findBySquareVariationId.mockResolvedValue(undefined);
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [certificateLine],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expectNothingRecorded();
  });

  it('never treats it as a lesson or class, even if its id were configured as one', async () => {
    // Guards a misconfiguration: the name check runs before any catalog lookup.
    mocks.getLessonCatalogObjectIds.mockResolvedValue(['VAR_GIFT_CERTIFICATE']);
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [{ ...certificateLine, name: 'Gift Certificate' }],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findBySquareVariationId).not.toHaveBeenCalled();
    expectNothingRecorded();
  });

  it('ignores an ad hoc "Gift certificate" line with no catalog id', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [
        {
          ...certificateLine,
          catalogObjectId: undefined,
          itemType: 'CUSTOM_AMOUNT',
        },
      ],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findBySquareVariationId).not.toHaveBeenCalled();
    expectNothingRecorded();
  });

  it('records only the class on a mixed order (certificate + class)', async () => {
    mocks.getOrder.mockResolvedValue({
      orderId: 'ORDER-1',
      lineItems: [
        certificateLine,
        { catalogObjectId: 'VAR_A', name: 'Pottery 101', quantity: 1 },
      ],
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    expect(mocks.findBySquareVariationId).toHaveBeenCalledTimes(1);
    expect(mocks.findBySquareVariationId).toHaveBeenCalledWith('VAR_A');
    expect(mocks.createRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        // Only the class line's money, never the certificate's $75.
        subtotalCents: 4500,
        pricePaidCents: 4770,
      })
    );
  });
});

describe('processPosSale — error handling', () => {
  it('marks failed and re-throws when Square throws', async () => {
    mocks.getPayment.mockRejectedValue(new Error('Square 500'));

    await expect(handler(makeEvent({ orderId: 'ORDER-1' }))).rejects.toThrow(
      'Square 500'
    );

    expect(mocks.markFailed).toHaveBeenCalledWith('PAY-1', 'Square 500');
    expect(mocks.markProcessed).not.toHaveBeenCalled();
  });
});
