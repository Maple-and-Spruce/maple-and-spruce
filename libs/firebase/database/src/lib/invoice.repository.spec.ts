import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('InvoiceRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all invoices ordered by createdAt desc', async () => {
      const snap1 = mockDocSnapshot('inv-1', firestoreInvoice());
      const snap2 = mockDocSnapshot(
        'inv-2',
        firestoreInvoice({ studentId: 'student-2', status: 'draft' })
      );
      const mockGet = vi
        .fn()
        .mockResolvedValue({ docs: [snap1, snap2] });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const invoices = await InvoiceRepository.findAll();

      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(invoices).toHaveLength(2);
      expect(invoices[0].id).toBe('inv-1');
      expect(invoices[1].studentId).toBe('student-2');
    });

    it('filters by studentId when provided', async () => {
      const snap = mockDocSnapshot('inv-1', firestoreInvoice());
      const mockGet = vi.fn().mockResolvedValue({ docs: [snap] });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await InvoiceRepository.findAll({ studentId: 'student-1' });

      expect(mockWhere).toHaveBeenCalledWith(
        'studentId',
        '==',
        'student-1'
      );
    });

    it('filters by status when provided', async () => {
      const snap = mockDocSnapshot('inv-1', firestoreInvoice());
      const mockGet = vi.fn().mockResolvedValue({ docs: [snap] });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await InvoiceRepository.findAll({ status: 'sent' });

      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'sent');
    });

    it('applies both filters when both provided', async () => {
      const mockGet = vi.fn().mockResolvedValue({ docs: [] });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere1 });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await InvoiceRepository.findAll({
        studentId: 'student-1',
        status: 'paid',
      });

      expect(mockWhere1).toHaveBeenCalledWith(
        'studentId',
        '==',
        'student-1'
      );
      expect(mockWhere2).toHaveBeenCalledWith('status', '==', 'paid');
    });
  });

  describe('findById', () => {
    it('returns the invoice when it exists', async () => {
      const snap = mockDocSnapshot('inv-1', firestoreInvoice());
      const mockGet = vi.fn().mockResolvedValue(snap);
      const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.findById('inv-1');

      expect(invoice).toBeDefined();
      expect(invoice?.id).toBe('inv-1');
      expect(invoice?.studentId).toBe('student-1');
      expect(invoice?.status).toBe('sent');
      expect(invoice?.lineItems).toHaveLength(1);
      expect(invoice?.totalCents).toBe(13000);
      expect(invoice?.issuedAt).toEqual(new Date('2026-04-20T10:00:00Z'));
    });

    it('returns undefined when the invoice does not exist', async () => {
      const snap = mockDocSnapshot('inv-missing', null);
      const mockGet = vi.fn().mockResolvedValue(snap);
      const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.findById('inv-missing');
      expect(invoice).toBeUndefined();
    });

    it('handles missing optional fields gracefully', async () => {
      const snap = mockDocSnapshot(
        'inv-1',
        firestoreInvoice({ issuedAt: undefined, paidAt: undefined, notes: undefined })
      );
      const mockGet = vi.fn().mockResolvedValue(snap);
      const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.findById('inv-1');
      expect(invoice?.issuedAt).toBeUndefined();
      expect(invoice?.paidAt).toBeUndefined();
    });
  });

  describe('create', () => {
    it('creates a draft invoice with computed subtotals and total', async () => {
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue({ id: 'new-inv', set: mockSet });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.create({
        studentId: 'student-1',
        lineItems: [
          {
            id: 'line-1',
            description: 'Lesson',
            quantity: 2,
            unitAmountCents: 5000,
            subtotalCents: 0,
          },
        ],
      });

      expect(mockSet).toHaveBeenCalledTimes(1);
      expect(invoice.id).toBe('new-inv');
      expect(invoice.status).toBe('draft');
      expect(invoice.lineItems[0].subtotalCents).toBe(10000);
      expect(invoice.totalCents).toBe(10000);
      expect(invoice.issuedAt).toBeUndefined();
      expect(invoice.paidAt).toBeUndefined();
    });

    it('stamps issuedAt when created directly as sent', async () => {
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue({ id: 'new-inv', set: mockSet });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.create({
        studentId: 'student-1',
        status: 'sent',
        lineItems: [
          {
            id: 'line-1',
            description: 'Lesson',
            quantity: 1,
            unitAmountCents: 3250,
            subtotalCents: 0,
          },
        ],
      });

      expect(invoice.status).toBe('sent');
      expect(invoice.issuedAt).toBeInstanceOf(Date);
      expect(invoice.paidAt).toBeUndefined();
    });

    it('stamps both issuedAt and paidAt when created directly as paid', async () => {
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue({ id: 'new-inv', set: mockSet });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      const invoice = await InvoiceRepository.create({
        studentId: 'student-1',
        status: 'paid',
        lineItems: [
          {
            id: 'line-1',
            description: 'Lesson',
            quantity: 1,
            unitAmountCents: 3250,
            subtotalCents: 0,
          },
        ],
      });

      expect(invoice.status).toBe('paid');
      expect(invoice.issuedAt).toBeInstanceOf(Date);
      expect(invoice.paidAt).toBeInstanceOf(Date);
    });
  });

  describe('update', () => {
    const existing = {
      id: 'inv-1',
      studentId: 'student-1',
      status: 'draft' as const,
      lineItems: [
        {
          id: 'line-1',
          description: 'Lesson',
          quantity: 2,
          unitAmountCents: 5000,
          subtotalCents: 10000,
        },
      ],
      totalCents: 10000,
      createdAt: new Date('2026-04-20T10:00:00Z'),
      updatedAt: new Date('2026-04-20T10:00:00Z'),
    };

    it('updates status from draft to sent and stamps issuedAt', async () => {
      const updatedSnap = mockDocSnapshot(
        'inv-1',
        firestoreInvoice({ status: 'sent', issuedAt: new Date() })
      );
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue(updatedSnap);
      const mockDoc = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      const result = await InvoiceRepository.update(
        { id: 'inv-1', status: 'sent' },
        existing
      );

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.status).toBe('sent');
      expect(payload.issuedAt).toBeInstanceOf(Date);
      expect(payload.paidAt).toBeUndefined();
      expect(result.id).toBe('inv-1');
    });

    it('stamps both issuedAt and paidAt when transitioning to paid from draft', async () => {
      const updatedSnap = mockDocSnapshot(
        'inv-1',
        firestoreInvoice({ status: 'paid', issuedAt: new Date(), paidAt: new Date() })
      );
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue(updatedSnap);
      const mockDoc = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await InvoiceRepository.update(
        { id: 'inv-1', status: 'paid' },
        existing
      );

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.issuedAt).toBeInstanceOf(Date);
      expect(payload.paidAt).toBeInstanceOf(Date);
    });

    it('preserves existing issuedAt when transitioning from sent to paid', async () => {
      const issuedAt = new Date('2026-04-21T10:00:00Z');
      const sentExisting = {
        ...existing,
        status: 'sent' as const,
        issuedAt,
      };
      const updatedSnap = mockDocSnapshot(
        'inv-1',
        firestoreInvoice({ status: 'paid', issuedAt, paidAt: new Date() })
      );
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue(updatedSnap);
      const mockDoc = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await InvoiceRepository.update(
        { id: 'inv-1', status: 'paid' },
        sentExisting
      );

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.issuedAt).toBe(issuedAt);
      expect(payload.paidAt).toBeInstanceOf(Date);
    });

    it('recomputes subtotals and total when lineItems change', async () => {
      const updatedSnap = mockDocSnapshot(
        'inv-1',
        firestoreInvoice({ totalCents: 6500 })
      );
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue(updatedSnap);
      const mockDoc = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await InvoiceRepository.update(
        {
          id: 'inv-1',
          lineItems: [
            {
              id: 'line-1',
              description: 'Lesson',
              quantity: 1,
              unitAmountCents: 6500,
              subtotalCents: 0,
            },
          ],
        },
        existing
      );

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.lineItems[0].subtotalCents).toBe(6500);
      expect(payload.totalCents).toBe(6500);
    });

    it('updates notes when provided', async () => {
      const updatedSnap = mockDocSnapshot(
        'inv-1',
        firestoreInvoice({ notes: 'Updated note' })
      );
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue(updatedSnap);
      const mockDoc = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await InvoiceRepository.update(
        { id: 'inv-1', notes: 'Updated note' },
        existing
      );

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.notes).toBe('Updated note');
    });

    it('throws if invoice not found after update', async () => {
      const missingSnap = mockDocSnapshot('inv-1', null);
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue(missingSnap);
      const mockDoc = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await expect(
        InvoiceRepository.update({ id: 'inv-1', status: 'sent' }, existing)
      ).rejects.toThrow('Invoice inv-1 not found after update');
    });
  });

  describe('delete', () => {
    it('deletes the invoice document', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue({ delete: mockDelete });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as FirebaseFirestore.CollectionReference);

      await InvoiceRepository.delete('inv-1');

      expect(mockDoc).toHaveBeenCalledWith('inv-1');
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });
  });

  // Repo methods used by the syncInvoiceToSquare trigger. They throw any
  // Firestore error (including NOT_FOUND) verbatim — discrimination of
  // "benign mid-sync delete" vs. "real bug like wrong id" is the trigger
  // handler's job because only it has the surrounding context.
  function mockDocUpdate(impl: () => Promise<unknown>) {
    const update = vi.fn().mockImplementation(impl);
    const mockDoc = vi.fn().mockReturnValue({ update });
    vi.mocked(db.collection).mockReturnValue({
      doc: mockDoc,
    } as unknown as FirebaseFirestore.CollectionReference);
    return { update, mockDoc };
  }

  describe('markSquareSynced', () => {
    it('writes the Square ids and clears prior error on the happy path', async () => {
      const { update } = mockDocUpdate(() => Promise.resolve(undefined));

      await InvoiceRepository.markSquareSynced({
        id: 'inv-1',
        squareOrderId: 'order-1',
        squareInvoiceId: 'sq-inv-1',
      });

      expect(update).toHaveBeenCalledTimes(1);
      const payload = update.mock.calls[0][0];
      expect(payload).toMatchObject({
        squareOrderId: 'order-1',
        squareInvoiceId: 'sq-inv-1',
        squareSyncError: null,
      });
    });

    it('propagates Firestore errors (caller decides what to swallow)', async () => {
      const notFound = Object.assign(
        new Error('5 NOT_FOUND: no entity to update'),
        { code: 5 }
      );
      mockDocUpdate(() => Promise.reject(notFound));

      await expect(
        InvoiceRepository.markSquareSynced({
          id: 'deleted-inv',
          squareOrderId: 'order-1',
          squareInvoiceId: 'sq-inv-1',
        })
      ).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('recordSquareSyncError', () => {
    it('writes the error message on the happy path', async () => {
      const { update } = mockDocUpdate(() => Promise.resolve(undefined));

      await InvoiceRepository.recordSquareSyncError({
        id: 'inv-1',
        error: 'Square 500',
      });

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toMatchObject({
        squareSyncError: 'Square 500',
      });
    });

    it('propagates Firestore errors (caller decides what to swallow)', async () => {
      const notFound = Object.assign(
        new Error('5 NOT_FOUND: no entity to update'),
        { code: 5 }
      );
      mockDocUpdate(() => Promise.reject(notFound));

      await expect(
        InvoiceRepository.recordSquareSyncError({
          id: 'deleted-inv',
          error: 'Square 500',
        })
      ).rejects.toThrow('NOT_FOUND');
    });
  });
});
