import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  regUpdate: vi.fn(),
  // ClassRepository
  findBySquareVariationId: vi.fn(),
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
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((config, handler) => {
    mocks.onDocumentWritten(config, handler);
    return handler;
  }),
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

vi.mock('@maple/firebase/database', () => ({
  getDb: () => ({
    collection: vi.fn(() => ({ add: mocks.mailAdd })),
  }),
  PosSaleRequestRepository: {
    markProcessed: mocks.markProcessed,
    markFailed: mocks.markFailed,
  },
  RegistrationRepository: {
    findById: mocks.findById,
    findBySquareOrderId: mocks.findBySquareOrderId,
    create: mocks.createRegistration,
    getDocRef: (id: string) => ({ id, update: mocks.regUpdate }),
  },
  ClassRepository: {
    findBySquareVariationId: mocks.findBySquareVariationId,
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

vi.mock('@maple/ts/domain', () => ({
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
    expect(mocks.regUpdate).not.toHaveBeenCalled();
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
    });

    await handler(makeEvent({ orderId: 'ORDER-1' }));

    // Flipped pending → confirmed with the Square payment ids — NOT a new POS reg.
    expect(mocks.createRegistration).not.toHaveBeenCalled();
    expect(mocks.regUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'confirmed',
        squarePaymentId: 'PAY-1',
        squareOrderId: 'ORDER-1',
        squareReceiptUrl: 'https://squareup.com/receipt/xyz',
      })
    );
    expect(mocks.markProcessed).toHaveBeenCalledWith('PAY-1');
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
