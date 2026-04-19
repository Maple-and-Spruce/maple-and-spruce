import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database config module
vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
  },
  toDate: (value: unknown, fallback: Date = new Date()): Date => {
    if (value === null || value === undefined) return fallback;
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? fallback : parsed;
    }
    return fallback;
  },
}));

import { InvoiceRepository } from './invoice.repository';
import { db } from './utilities/database.config';

function mockDocSnapshot(
  id: string,
  data: Record<string, unknown> | null
): {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
} {
  return {
    id,
    exists: data !== null,
    data: () => (data !== null ? data : undefined),
  };
}

/** Minimal invoice data stored in Firestore */
function firestoreInvoice(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('InvoiceRepository (new methods added in #281)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── findBySquareInvoiceId ────────────────────────────────────────────

  describe('findBySquareInvoiceId', () => {
    it('returns the invoice when one matches', async () => {
      const snap = mockDocSnapshot(
        'inv-1',
        firestoreInvoice({
          squareOrderId: 'SQ-ORDER',
          squareInvoiceId: 'SQ-INVOICE-1',
        })
      );
      const mockGet = vi.fn().mockResolvedValue({ empty: false, docs: [snap] });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      vi.mocked(db.collection).mockReturnValue({
        where: mockWhere,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.findBySquareInvoiceId(
        'SQ-INVOICE-1'
      );

      expect(mockWhere).toHaveBeenCalledWith(
        'squareInvoiceId',
        '==',
        'SQ-INVOICE-1'
      );
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(invoice?.id).toBe('inv-1');
      expect(invoice?.squareInvoiceId).toBe('SQ-INVOICE-1');
    });

    it('returns undefined when no invoice matches', async () => {
      const mockGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      vi.mocked(db.collection).mockReturnValue({
        where: mockWhere,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.findBySquareInvoiceId(
        'SQ-UNKNOWN'
      );
      expect(invoice).toBeUndefined();
    });
  });

  // ── markPaidBySquareWebhook ──────────────────────────────────────────

  describe('markPaidBySquareWebhook', () => {
    function setupDoc(existing: Record<string, unknown>, id = 'inv-1') {
      const snapBefore = mockDocSnapshot(id, existing);
      const snapAfter = mockDocSnapshot(id, {
        ...existing,
        status: 'paid',
        paymentRecord: {
          source: 'square-webhook',
          squarePaymentId: 'SQ-PAY-1',
          recordedAt: new Date(),
        },
        paidAt: new Date(),
      });

      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi
        .fn()
        // First call: current state before update
        .mockResolvedValueOnce(snapBefore)
        // Second call: state after update
        .mockResolvedValueOnce(snapAfter);
      const mockDoc = vi.fn().mockReturnValue({
        get: mockGet,
        update: mockUpdate,
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      return { mockUpdate, mockGet, mockDoc };
    }

    it('flips a sent invoice to paid with square-webhook attribution', async () => {
      const { mockUpdate } = setupDoc(
        firestoreInvoice({ squareInvoiceId: 'SQ-1' })
      );

      const result = await InvoiceRepository.markPaidBySquareWebhook({
        id: 'inv-1',
        squarePaymentId: 'SQ-PAY-1',
      });

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.status).toBe('paid');
      expect(payload.paymentRecord.source).toBe('square-webhook');
      expect(payload.paymentRecord.squarePaymentId).toBe('SQ-PAY-1');
      expect(payload.paymentRecord.recordedAt).toBeInstanceOf(Date);
      expect(result.status).toBe('paid');
    });

    it('is idempotent when invoice is already paid — returns early without writing', async () => {
      const existing = firestoreInvoice({
        status: 'paid',
        paidAt: new Date('2026-04-23'),
        paymentRecord: {
          source: 'admin-manual',
          recordedAt: new Date('2026-04-23'),
        },
      });
      const snap = mockDocSnapshot('inv-1', existing);
      const mockUpdate = vi.fn();
      const mockGet = vi.fn().mockResolvedValue(snap);
      const mockDoc = vi.fn().mockReturnValue({
        get: mockGet,
        update: mockUpdate,
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      const result = await InvoiceRepository.markPaidBySquareWebhook({
        id: 'inv-1',
        squarePaymentId: 'SQ-PAY-LATE',
      });

      expect(mockUpdate).not.toHaveBeenCalled();
      // Existing attribution preserved (admin-manual stays)
      expect(result.paymentRecord?.source).toBe('admin-manual');
    });

    it('throws when invoice does not exist', async () => {
      const snap = mockDocSnapshot('inv-missing', null);
      const mockGet = vi.fn().mockResolvedValue(snap);
      const mockDoc = vi.fn().mockReturnValue({
        get: mockGet,
        update: vi.fn(),
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await expect(
        InvoiceRepository.markPaidBySquareWebhook({
          id: 'inv-missing',
          squarePaymentId: 'SQ-PAY-1',
        })
      ).rejects.toThrow(/not found/);
    });
  });

  // ── markSquareSynced ─────────────────────────────────────────────────

  describe('markSquareSynced', () => {
    it('stamps square ids and clears prior error', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue({ update: mockUpdate });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await InvoiceRepository.markSquareSynced({
        id: 'inv-1',
        squareOrderId: 'SQ-ORDER',
        squareInvoiceId: 'SQ-INVOICE',
      });

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.squareOrderId).toBe('SQ-ORDER');
      expect(payload.squareInvoiceId).toBe('SQ-INVOICE');
      expect(payload.squareSyncError).toBeNull();
      expect(payload.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ── recordSquareSyncError ────────────────────────────────────────────

  describe('recordSquareSyncError', () => {
    it('writes the error message and bumps updatedAt', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue({ update: mockUpdate });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await InvoiceRepository.recordSquareSyncError({
        id: 'inv-1',
        error: 'Square API timeout',
      });

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.squareSyncError).toBe('Square API timeout');
      expect(payload.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ── paymentRecord round-trip ────────────────────────────────────────

  describe('paymentRecord round-trip via docToInvoice', () => {
    it('hydrates paymentRecord from Firestore-shaped data', async () => {
      const snap = mockDocSnapshot(
        'inv-1',
        firestoreInvoice({
          squareInvoiceId: 'SQ-1',
          paymentRecord: {
            source: 'square-webhook',
            squarePaymentId: 'SQ-PAY',
            recordedAt: new Date('2026-04-23T14:00:00Z'),
          },
        })
      );
      const mockGet = vi.fn().mockResolvedValue({
        empty: false,
        docs: [snap],
      });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      vi.mocked(db.collection).mockReturnValue({
        where: mockWhere,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.findBySquareInvoiceId('SQ-1');
      expect(invoice?.paymentRecord).toEqual({
        source: 'square-webhook',
        squarePaymentId: 'SQ-PAY',
        recordedAt: new Date('2026-04-23T14:00:00Z'),
      });
    });
  });
});
