import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the sync-invoice-to-square Firestore trigger.
 *
 * We mock the trigger's firebase wrappers so the exported handler runs
 * directly, plus mock the Square client / repositories to verify the
 * orchestration logic around status transitions:
 *  - draft → sent: send via Square, stamp ids
 *  - sent  → void: cancel on Square
 *  - everything else: no-op
 *
 * Also covers error handling: sync failures persist `squareSyncError`
 * on the invoice rather than throwing (the trigger must return cleanly
 * or Firestore will retry the event forever).
 */

const mocks = vi.hoisted(() => {
  return {
    // Firestore trigger — return the handler directly so we can invoke it
    onDocumentWritten: vi.fn(),
    // Repositories
    studentFindById: vi.fn(),
    markSquareSynced: vi.fn(),
    recordSquareSyncError: vi.fn(),
    // Square
    sendInvoice: vi.fn(),
    cancelInvoice: vi.fn(),
  };
});

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => {
    mocks.onDocumentWritten(_config, handler);
    return handler;
  }),
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({
    name,
    value: () => `mock-${name}`,
  })),
  defineString: vi.fn((name: string) => ({
    name,
    value: () => `mock-${name}`,
  })),
}));

vi.mock('@maple/firebase/database', () => ({
  InvoiceRepository: {
    markSquareSynced: mocks.markSquareSynced,
    recordSquareSyncError: mocks.recordSquareSyncError,
  },
  StudentRepository: {
    findById: mocks.studentFindById,
  },
}));

vi.mock('@maple/firebase/square', () => {
  return {
    Square: class MockSquare {
      locationId = 'LW0MMBZ';
      invoicesService = {
        sendInvoice: mocks.sendInvoice,
        cancelInvoice: mocks.cancelInvoice,
      };
    },
    SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'] as const,
    SQUARE_STRING_NAMES: ['SQUARE_ENV', 'SQUARE_LOCATION_ID', 'SALES_TAX_RATE'] as const,
  };
});

// Import after mocks
import { syncInvoiceToSquare } from './sync-invoice-to-square';

type Handler = (event: unknown) => Promise<void>;
const handler = syncInvoiceToSquare as unknown as Handler;

function makeSnap(
  exists: boolean,
  data?: Record<string, unknown>,
  id = 'inv-1'
): unknown {
  return {
    id,
    exists,
    data: () => (exists ? data : undefined),
  };
}

const baseSent = {
  studentId: 'student-1',
  status: 'sent',
  lineItems: [
    {
      id: 'line-1',
      description: 'April tuition',
      quantity: 4,
      unitAmountCents: 3250,
      subtotalCents: 13000,
    },
  ],
  totalCents: 13000,
  issuedAt: new Date('2026-04-20T10:00:00Z'),
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T10:00:00Z'),
};

const sampleStudent = {
  id: 'student-1',
  name: 'Olive Thompson',
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-1',
  isHopeScholarship: false,
  primaryContactName: 'Rita Thompson',
  primaryContactEmail: 'rita@example.com',
  primaryContactPhone: '555-111-2222',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('syncInvoiceToSquare trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('draft → sent', () => {
    beforeEach(() => {
      mocks.studentFindById.mockResolvedValue(sampleStudent);
      mocks.sendInvoice.mockResolvedValue({
        squareCustomerId: 'SQ-CUST',
        squareOrderId: 'SQ-ORDER',
        squareInvoiceId: 'SQ-INV',
      });
    });

    it('sends the invoice via Square and stamps ids', async () => {
      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, { ...baseSent, status: 'draft' }),
          after: makeSnap(true, baseSent),
        },
      });

      expect(mocks.sendInvoice).toHaveBeenCalledTimes(1);
      const arg = mocks.sendInvoice.mock.calls[0][0];
      expect(arg.idempotencyKey).toBe('inv-1');
      expect(arg.locationId).toBe('LW0MMBZ');
      expect(arg.customer.email).toBe('rita@example.com');
      expect(arg.customer.name).toBe('Rita Thompson');
      expect(arg.lineItems[0].unitAmountCents).toBe(3250);

      expect(mocks.markSquareSynced).toHaveBeenCalledWith({
        id: 'inv-1',
        squareOrderId: 'SQ-ORDER',
        squareInvoiceId: 'SQ-INV',
      });
      expect(mocks.recordSquareSyncError).not.toHaveBeenCalled();
    });

    it('skips when invoice already has a squareInvoiceId (idempotent)', async () => {
      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, { ...baseSent, status: 'draft' }),
          after: makeSnap(true, {
            ...baseSent,
            squareInvoiceId: 'SQ-INV-PRIOR',
          }),
        },
      });

      expect(mocks.sendInvoice).not.toHaveBeenCalled();
      expect(mocks.markSquareSynced).not.toHaveBeenCalled();
    });

    it('skips when invoice has a prior sync error (waits for admin retry)', async () => {
      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, { ...baseSent, status: 'draft' }),
          after: makeSnap(true, {
            ...baseSent,
            squareSyncError: 'Previous error',
          }),
        },
      });

      expect(mocks.sendInvoice).not.toHaveBeenCalled();
    });

    it('records sync error when student not found', async () => {
      mocks.studentFindById.mockResolvedValue(undefined);

      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, { ...baseSent, status: 'draft' }),
          after: makeSnap(true, baseSent),
        },
      });

      expect(mocks.sendInvoice).not.toHaveBeenCalled();
      expect(mocks.recordSquareSyncError).toHaveBeenCalledWith({
        id: 'inv-1',
        error: expect.stringMatching(/Student not found/),
      });
    });

    it('records sync error when student is Hope Scholarship (defense-in-depth)', async () => {
      mocks.studentFindById.mockResolvedValue({
        ...sampleStudent,
        isHopeScholarship: true,
      });

      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, { ...baseSent, status: 'draft' }),
          after: makeSnap(true, baseSent),
        },
      });

      expect(mocks.sendInvoice).not.toHaveBeenCalled();
      expect(mocks.recordSquareSyncError).toHaveBeenCalledWith({
        id: 'inv-1',
        error: expect.stringMatching(/Hope Scholarship/),
      });
    });

    it('records sync error when Square API throws', async () => {
      mocks.sendInvoice.mockRejectedValue(new Error('Square was down'));

      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, { ...baseSent, status: 'draft' }),
          after: makeSnap(true, baseSent),
        },
      });

      expect(mocks.markSquareSynced).not.toHaveBeenCalled();
      expect(mocks.recordSquareSyncError).toHaveBeenCalledWith({
        id: 'inv-1',
        error: 'Square was down',
      });
    });

    it('records a generic error when Square throws a non-Error', async () => {
      mocks.sendInvoice.mockRejectedValue('something weird');

      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, { ...baseSent, status: 'draft' }),
          after: makeSnap(true, baseSent),
        },
      });

      expect(mocks.recordSquareSyncError).toHaveBeenCalledWith({
        id: 'inv-1',
        error: expect.stringMatching(/Unknown Square sync error/i),
      });
    });
  });

  describe('sent → void', () => {
    it('cancels on Square when the invoice has a squareInvoiceId', async () => {
      mocks.cancelInvoice.mockResolvedValue(undefined);

      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, {
            ...baseSent,
            squareInvoiceId: 'SQ-INV-1',
          }),
          after: makeSnap(true, {
            ...baseSent,
            status: 'void',
            squareInvoiceId: 'SQ-INV-1',
          }),
        },
      });

      expect(mocks.cancelInvoice).toHaveBeenCalledWith('SQ-INV-1');
      // Clear prior sync error after a successful cancel
      expect(mocks.recordSquareSyncError).toHaveBeenCalledWith({
        id: 'inv-1',
        error: '',
      });
    });

    it('skips cancel when transitioning paid → void (Square rejects it)', async () => {
      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, {
            ...baseSent,
            status: 'paid',
            squareInvoiceId: 'SQ-INV-1',
          }),
          after: makeSnap(true, {
            ...baseSent,
            status: 'void',
            squareInvoiceId: 'SQ-INV-1',
          }),
        },
      });

      expect(mocks.cancelInvoice).not.toHaveBeenCalled();
    });

    it('skips cancel when no squareInvoiceId on the invoice', async () => {
      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, { ...baseSent }),
          after: makeSnap(true, { ...baseSent, status: 'void' }),
        },
      });

      expect(mocks.cancelInvoice).not.toHaveBeenCalled();
    });

    it('records sync error when Square cancel throws', async () => {
      mocks.cancelInvoice.mockRejectedValue(new Error('INVALID_INVOICE_STATUS'));

      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, {
            ...baseSent,
            squareInvoiceId: 'SQ-INV-1',
          }),
          after: makeSnap(true, {
            ...baseSent,
            status: 'void',
            squareInvoiceId: 'SQ-INV-1',
          }),
        },
      });

      expect(mocks.recordSquareSyncError).toHaveBeenCalledWith({
        id: 'inv-1',
        error: 'INVALID_INVOICE_STATUS',
      });
    });
  });

  describe('no-op paths', () => {
    it('skips when the doc is deleted (no after snapshot)', async () => {
      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, baseSent),
          after: makeSnap(false),
        },
      });

      expect(mocks.sendInvoice).not.toHaveBeenCalled();
      expect(mocks.cancelInvoice).not.toHaveBeenCalled();
      expect(mocks.markSquareSynced).not.toHaveBeenCalled();
    });

    it('skips when status is draft (not yet sent)', async () => {
      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(false),
          after: makeSnap(true, { ...baseSent, status: 'draft' }),
        },
      });

      expect(mocks.sendInvoice).not.toHaveBeenCalled();
      expect(mocks.cancelInvoice).not.toHaveBeenCalled();
    });

    it('skips when status is paid (webhook already handled it)', async () => {
      await handler({
        params: { invoiceId: 'inv-1' },
        data: {
          before: makeSnap(true, {
            ...baseSent,
            squareInvoiceId: 'SQ-INV-1',
          }),
          after: makeSnap(true, {
            ...baseSent,
            status: 'paid',
            squareInvoiceId: 'SQ-INV-1',
          }),
        },
      });

      expect(mocks.sendInvoice).not.toHaveBeenCalled();
      expect(mocks.cancelInvoice).not.toHaveBeenCalled();
    });
  });
});
