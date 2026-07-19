import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the recordInvoicePayment cloud function handler.
 *
 * Mocks createAdminFunction + the throw helpers so the handler runs as a
 * plain function, and mocks InvoiceRepository so we can assert what the
 * handler forwards. Uses the real MANUAL_INVOICE_PAYMENT_SOURCES so the
 * allow-list isn't re-implemented here.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  recordManualPayment: vi.fn(),
  assertCanRecordInvoicePayment: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  createRoleFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  assertCanRecordInvoicePayment: mocks.assertCanRecordInvoicePayment,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
  throwInvalidArgument: (message: string) => {
    throw new Error(`invalid-argument: ${message}`);
  },
  throwFailedPrecondition: (message: string) => {
    throw new Error(`failed-precondition: ${message}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  InvoiceRepository: {
    findById: mocks.findById,
    recordManualPayment: mocks.recordManualPayment,
  },
}));

import { recordInvoicePayment } from './record-invoice-payment';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = recordInvoicePayment as unknown as Handler;

const sentInvoice = {
  id: 'inv-1',
  studentId: 'student-1',
  status: 'sent',
  lineItems: [
    {
      id: 'l1',
      description: 'April tuition',
      quantity: 4,
      unitAmountCents: 3250,
      subtotalCents: 13000,
    },
  ],
  totalCents: 13000,
  issuedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('recordInvoicePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ownership passes by default (admin / owning teacher).
    mocks.assertCanRecordInvoicePayment.mockResolvedValue(undefined);
  });

  it('enforces ownership: propagates a permission-denied from the guard', async () => {
    mocks.findById.mockResolvedValue(sentInvoice);
    mocks.assertCanRecordInvoicePayment.mockRejectedValue(
      new Error('permission-denied: not your lesson')
    );
    await expect(
      handler({ id: 'inv-1', source: 'venmo-manual' }, { uid: 'uid-teacher' })
    ).rejects.toThrow(/permission-denied/);
    // Guard ran against the loaded invoice; no payment recorded.
    expect(mocks.assertCanRecordInvoicePayment).toHaveBeenCalledWith(
      { uid: 'uid-teacher' },
      sentInvoice
    );
    expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('records a Venmo payment and stamps the caller uid', async () => {
    mocks.findById.mockResolvedValue(sentInvoice);
    mocks.recordManualPayment.mockResolvedValue({
      ...sentInvoice,
      status: 'paid',
      paymentRecord: {
        source: 'venmo-manual',
        recordedByUid: 'uid-katie',
        recordedAt: new Date(),
      },
    });

    const result = (await handler(
      { id: 'inv-1', source: 'venmo-manual' },
      { uid: 'uid-katie' }
    )) as { invoice: { status: string; paymentRecord: { source: string } } };

    expect(mocks.recordManualPayment).toHaveBeenCalledWith({
      id: 'inv-1',
      source: 'venmo-manual',
      note: undefined,
      recordedByUid: 'uid-katie',
    });
    expect(result.invoice.paymentRecord.source).toBe('venmo-manual');
  });

  it('trims a note and forwards it', async () => {
    mocks.findById.mockResolvedValue(sentInvoice);
    mocks.recordManualPayment.mockResolvedValue({
      ...sentInvoice,
      status: 'paid',
    });

    await handler(
      { id: 'inv-1', source: 'venmo-manual', note: '  @casey-nguyen  ' },
      { uid: 'uid-katie' }
    );

    expect(mocks.recordManualPayment).toHaveBeenCalledWith(
      expect.objectContaining({ note: '@casey-nguyen' })
    );
  });

  it('records an admin-manual (cash/check) payment', async () => {
    mocks.findById.mockResolvedValue(sentInvoice);
    mocks.recordManualPayment.mockResolvedValue({
      ...sentInvoice,
      status: 'paid',
    });

    await handler({ id: 'inv-1', source: 'admin-manual' }, { uid: 'uid-nathan' });

    expect(mocks.recordManualPayment).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'admin-manual' })
    );
  });

  it('rejects a spoofed server-only source (square-webhook)', async () => {
    await expect(
      handler({ id: 'inv-1', source: 'square-webhook' }, { uid: 'u' })
    ).rejects.toThrow(/invalid-argument/);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('rejects the reconciliation-only source (venmo-import)', async () => {
    await expect(
      handler({ id: 'inv-1', source: 'venmo-import' }, { uid: 'u' })
    ).rejects.toThrow(/invalid-argument/);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('throws not-found when the invoice does not exist', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(
      handler({ id: 'missing', source: 'venmo-manual' }, { uid: 'u' })
    ).rejects.toThrow(/Invoice not found/);
    expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('is idempotent: already-paid invoice is returned untouched', async () => {
    const paid = {
      ...sentInvoice,
      status: 'paid',
      paymentRecord: {
        source: 'square-webhook',
        squarePaymentId: 'sqp-1',
        recordedAt: new Date(),
      },
    };
    mocks.findById.mockResolvedValue(paid);

    const result = (await handler(
      { id: 'inv-1', source: 'venmo-manual' },
      { uid: 'u' }
    )) as { invoice: { paymentRecord: { source: string } } };

    // Does not overwrite the original Square attribution.
    expect(result.invoice.paymentRecord.source).toBe('square-webhook');
    expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('rejects recording a payment on a draft invoice', async () => {
    mocks.findById.mockResolvedValue({ ...sentInvoice, status: 'draft' });

    await expect(
      handler({ id: 'inv-1', source: 'venmo-manual' }, { uid: 'u' })
    ).rejects.toThrow(/failed-precondition/);
    expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('rejects an over-long note', async () => {
    await expect(
      handler(
        { id: 'inv-1', source: 'venmo-manual', note: 'x'.repeat(501) },
        { uid: 'u' }
      )
    ).rejects.toThrow(/invalid-argument/);
    expect(mocks.findById).not.toHaveBeenCalled();
  });
});
