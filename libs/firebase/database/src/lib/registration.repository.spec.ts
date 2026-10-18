import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database config module
vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
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

import { RegistrationRepository } from './registration.repository';
import { db } from './utilities/database.config';

/** Helper: build a mock Firestore document snapshot */
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

/** Minimal registration data stored in Firestore */
function firestoreRegData(overrides: Record<string, unknown> = {}) {
  return {
    classId: 'class-1',
    customerEmail: 'alice@example.com',
    customerName: 'Alice',
    customerPhone: '555-1234',
    quantity: 1,
    pricePaidCents: 5300,
    subtotalCents: 5000,
    taxAmountCents: 300,
    taxRatePercent: 6,
    squarePaymentId: 'sq-pay-1',
    squareOrderId: 'sq-ord-1',
    squareReceiptUrl: 'https://squareup.com/receipt/1',
    discountCode: undefined,
    discountAmountCents: undefined,
    status: 'confirmed',
    source: 'web',
    notes: undefined,
    confirmationSentAt: new Date('2026-03-01'),
    reminderSentAt: undefined,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-02'),
    ...overrides,
  };
}

describe('RegistrationRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── findAll ──────────────────────────────────────────────────────────

  describe('findAll', () => {
    function setupFindAll(
      docs: Array<{ id: string; data: Record<string, unknown> }>
    ) {
      const mockDocs = docs.map((d) => mockDocSnapshot(d.id, d.data));
      const mockGet = vi.fn().mockResolvedValue({ docs: mockDocs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere: ReturnType<typeof vi.fn> = vi.fn();
      // Allow chaining: collection().where().where().orderBy().get()
      const chainable = {
        where: mockWhere,
        orderBy: mockOrderBy,
        get: mockGet,
      };
      mockWhere.mockReturnValue(chainable);

      const mockCollection = vi.fn().mockReturnValue(chainable);
      vi.mocked(db.collection).mockImplementation(mockCollection);

      return { mockWhere, mockOrderBy, mockGet };
    }

    it('returns all registrations when no filters are provided', async () => {
      setupFindAll([
        { id: 'reg-1', data: firestoreRegData() },
        {
          id: 'reg-2',
          data: firestoreRegData({
            customerEmail: 'bob@example.com',
            customerName: 'Bob',
          }),
        },
      ]);

      const results = await RegistrationRepository.findAll();

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('reg-1');
      expect(results[1].id).toBe('reg-2');
    });

    it('applies classId filter when provided', async () => {
      const { mockWhere } = setupFindAll([]);

      await RegistrationRepository.findAll({ classId: 'class-42' });

      expect(mockWhere).toHaveBeenCalledWith('classId', '==', 'class-42');
    });

    it('applies customerEmail filter when provided', async () => {
      const { mockWhere } = setupFindAll([]);

      await RegistrationRepository.findAll({
        customerEmail: 'alice@example.com',
      });

      expect(mockWhere).toHaveBeenCalledWith(
        'customerEmail',
        '==',
        'alice@example.com'
      );
    });

    it('applies status filter when provided', async () => {
      const { mockWhere } = setupFindAll([]);

      await RegistrationRepository.findAll({ status: 'cancelled' });

      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'cancelled');
    });

    it('applies source filter when provided', async () => {
      const { mockWhere } = setupFindAll([]);

      await RegistrationRepository.findAll({ source: 'pos' });

      expect(mockWhere).toHaveBeenCalledWith('source', '==', 'pos');
    });

    it('orders results by createdAt desc', async () => {
      const { mockOrderBy } = setupFindAll([]);

      await RegistrationRepository.findAll();

      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('maps Firestore documents to Registration objects', async () => {
      setupFindAll([
        {
          id: 'reg-1',
          data: firestoreRegData({
            confirmationSentAt: new Date('2026-03-01T10:00:00Z'),
          }),
        },
      ]);

      const results = await RegistrationRepository.findAll();

      expect(results).toHaveLength(1);
      const reg = results[0];
      expect(reg.id).toBe('reg-1');
      expect(reg.classId).toBe('class-1');
      expect(reg.customerEmail).toBe('alice@example.com');
      expect(reg.status).toBe('confirmed');
      expect(reg.createdAt).toBeInstanceOf(Date);
      expect(reg.updatedAt).toBeInstanceOf(Date);
      expect(reg.confirmationSentAt).toBeInstanceOf(Date);
    });

    it('filters out docs that do not exist', async () => {
      // Simulate a doc with exists: false sneaking through
      const mockDocs = [
        mockDocSnapshot('reg-1', firestoreRegData()),
        mockDocSnapshot('reg-gone', null),
      ];
      const mockGet = vi.fn().mockResolvedValue({ docs: mockDocs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockReturnThis(), orderBy: mockOrderBy, get: mockGet });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const results = await RegistrationRepository.findAll();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('reg-1');
    });
  });

  // ── findById ─────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns a registration when the document exists', async () => {
      const mockDoc = mockDocSnapshot('reg-1', firestoreRegData());
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await RegistrationRepository.findById('reg-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('reg-1');
      expect(result!.customerEmail).toBe('alice@example.com');
      expect(mockDocFn).toHaveBeenCalledWith('reg-1');
    });

    it('returns undefined when the document does not exist', async () => {
      const mockDoc = mockDocSnapshot('reg-missing', null);
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await RegistrationRepository.findById('reg-missing');

      expect(result).toBeUndefined();
    });

    it('converts optional date fields correctly', async () => {
      const mockDoc = mockDocSnapshot(
        'reg-1',
        firestoreRegData({
          confirmationSentAt: new Date('2026-04-01'),
          reminderSentAt: new Date('2026-04-10'),
        })
      );
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await RegistrationRepository.findById('reg-1');

      expect(result!.confirmationSentAt).toBeInstanceOf(Date);
      expect(result!.reminderSentAt).toBeInstanceOf(Date);
    });

    it("defaults source to 'web' for documents missing the field (back-compat)", async () => {
      const mockDoc = mockDocSnapshot(
        'reg-old',
        firestoreRegData({ source: undefined })
      );
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await RegistrationRepository.findById('reg-old');

      expect(result!.source).toBe('web');
    });

    it("reads source as 'pos' when set", async () => {
      const mockDoc = mockDocSnapshot(
        'reg-pos',
        firestoreRegData({ source: 'pos' })
      );
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await RegistrationRepository.findById('reg-pos');

      expect(result!.source).toBe('pos');
    });

    it('leaves optional date fields undefined when not set', async () => {
      const mockDoc = mockDocSnapshot(
        'reg-1',
        firestoreRegData({
          confirmationSentAt: undefined,
          reminderSentAt: undefined,
        })
      );
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await RegistrationRepository.findById('reg-1');

      expect(result!.confirmationSentAt).toBeUndefined();
      expect(result!.reminderSentAt).toBeUndefined();
    });
  });

  // ── findByClassId ────────────────────────────────────────────────────

  describe('findByClassId', () => {
    it('delegates to findAll with classId filter', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        docs: [mockDocSnapshot('reg-1', firestoreRegData())],
      });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ orderBy: mockOrderBy }),
        orderBy: mockOrderBy,
      });
      const mockCollection = vi.fn().mockReturnValue({
        where: mockWhere,
        orderBy: mockOrderBy,
      });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const results = await RegistrationRepository.findByClassId('class-1');

      expect(results).toHaveLength(1);
      expect(mockWhere).toHaveBeenCalledWith('classId', '==', 'class-1');
    });
  });

  // ── countByClassId ───────────────────────────────────────────────────

  describe('countByClassId', () => {
    function setupMockDocs(
      docs: Array<{ quantity?: number; status: string }>
    ): void {
      const mockDocs = docs.map((d, i) => ({
        id: `reg-${i}`,
        data: () => d,
      }));

      const mockGet = vi.fn().mockResolvedValue({ docs: mockDocs });
      const mockWhere = vi.fn().mockReturnThis();
      const mockCollection = vi.fn().mockReturnValue({
        where: mockWhere,
        get: mockGet,
      });
      // Chain where calls: collection().where().where().get()
      mockWhere.mockReturnValue({ where: mockWhere, get: mockGet });

      vi.mocked(db.collection).mockImplementation(mockCollection);
    }

    it('returns 0 when no registrations exist', async () => {
      setupMockDocs([]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(0);
    });

    it('sums quantities for registrations with quantity 1', async () => {
      setupMockDocs([
        { quantity: 1, status: 'confirmed' },
        { quantity: 1, status: 'confirmed' },
        { quantity: 1, status: 'confirmed' },
      ]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(3);
    });

    it('sums quantities for registrations with quantity 2', async () => {
      setupMockDocs([
        { quantity: 2, status: 'confirmed' },
        { quantity: 2, status: 'confirmed' },
      ]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(4);
    });

    it('sums mixed quantities correctly', async () => {
      setupMockDocs([
        { quantity: 1, status: 'confirmed' },
        { quantity: 3, status: 'pending' },
        { quantity: 2, status: 'confirmed' },
      ]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(6);
    });

    it('defaults to 1 when quantity field is missing', async () => {
      setupMockDocs([
        { status: 'confirmed' },
        { quantity: 2, status: 'confirmed' },
      ]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(3);
    });

    it('passes correct statuses filter to Firestore query', async () => {
      const mockGet = vi.fn().mockResolvedValue({ docs: [] });
      const mockWhere = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ get: mockGet }),
      });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await RegistrationRepository.countByClassId('class-1');

      expect(mockWhere).toHaveBeenCalledWith('classId', '==', 'class-1');
    });

    it('uses default statuses of pending and confirmed', async () => {
      const mockGet = vi.fn().mockResolvedValue({ docs: [] });
      const mockWhereStatus = vi
        .fn()
        .mockReturnValue({ get: mockGet });
      const mockWhere = vi
        .fn()
        .mockReturnValue({ where: mockWhereStatus });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await RegistrationRepository.countByClassId('class-1');

      expect(mockWhereStatus).toHaveBeenCalledWith('status', 'in', [
        'pending',
        'confirmed',
      ]);
    });

    it('accepts custom statuses', async () => {
      const mockGet = vi.fn().mockResolvedValue({ docs: [] });
      const mockWhereStatus = vi
        .fn()
        .mockReturnValue({ get: mockGet });
      const mockWhere = vi
        .fn()
        .mockReturnValue({ where: mockWhereStatus });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await RegistrationRepository.countByClassId('class-1', ['confirmed']);

      expect(mockWhereStatus).toHaveBeenCalledWith('status', 'in', [
        'confirmed',
      ]);
    });
  });

  // ── create ───────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a registration document and returns it with id and timestamps', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'reg-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const input = {
        classId: 'class-1',
        customerEmail: 'alice@example.com',
        customerName: 'Alice',
        quantity: 2,
        pricePaidCents: 10600,
        subtotalCents: 10000,
        taxAmountCents: 600,
        taxRatePercent: 6,
        status: 'confirmed' as const,
        source: 'web' as const,
      };

      const result = await RegistrationRepository.create(input);

      expect(mockSet).toHaveBeenCalled();
      expect(result.id).toBe('reg-new');
      expect(result.classId).toBe('class-1');
      expect(result.customerEmail).toBe('alice@example.com');
      expect(result.quantity).toBe(2);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('sets createdAt and updatedAt to the same timestamp', async () => {
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDocRef = vi.fn().mockReturnValue({
        id: 'reg-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await RegistrationRepository.create({
        classId: 'class-1',
        customerEmail: 'bob@example.com',
        customerName: 'Bob',
        quantity: 1,
        pricePaidCents: 5300,
        subtotalCents: 5000,
        taxAmountCents: 300,
        taxRatePercent: 6,
        status: 'pending' as const,
        source: 'web' as const,
      });

      expect(result.createdAt.getTime()).toBe(result.updatedAt.getTime());
    });

    it('spreads the input data into the stored document', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });
      const mockDocRef = vi.fn().mockReturnValue({
        id: 'reg-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await RegistrationRepository.create({
        classId: 'class-5',
        customerEmail: 'charlie@example.com',
        customerName: 'Charlie',
        customerPhone: '555-9999',
        quantity: 3,
        pricePaidCents: 15900,
        subtotalCents: 15000,
        taxAmountCents: 900,
        taxRatePercent: 6,
        squarePaymentId: 'sq-pay-5',
        status: 'confirmed' as const,
        source: 'pos' as const,
        notes: 'Window seat please',
      });

      expect(savedData.classId).toBe('class-5');
      expect(savedData.customerPhone).toBe('555-9999');
      expect(savedData.squarePaymentId).toBe('sq-pay-5');
      expect(savedData.notes).toBe('Window seat please');
    });
  });

  // ── update ───────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates the document and returns the refreshed registration', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });
      const updatedDoc = mockDocSnapshot(
        'reg-1',
        firestoreRegData({ status: 'cancelled' })
      );
      const mockGet = vi.fn().mockResolvedValue(updatedDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await RegistrationRepository.update({
        id: 'reg-1',
        status: 'cancelled',
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(updatedFields.status).toBe('cancelled');
      expect(updatedFields.updatedAt).toBeInstanceOf(Date);
      expect(result.id).toBe('reg-1');
    });

    it('sets updatedAt timestamp on the update payload', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });
      const updatedDoc = mockDocSnapshot('reg-1', firestoreRegData());
      const mockGet = vi.fn().mockResolvedValue(updatedDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await RegistrationRepository.update({
        id: 'reg-1',
        notes: 'Updated notes',
      });

      expect(updatedFields.updatedAt).toBeInstanceOf(Date);
      expect(updatedFields.notes).toBe('Updated notes');
      // id should not be included in the update payload
      expect(updatedFields.id).toBeUndefined();
    });

    it('throws when the document is missing after update', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi
        .fn()
        .mockResolvedValue(mockDocSnapshot('reg-gone', null));
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await expect(
        RegistrationRepository.update({ id: 'reg-gone', status: 'refunded' })
      ).rejects.toThrow('Registration reg-gone not found after update');
    });
  });

  // ── getDocRef ────────────────────────────────────────────────────────

  describe('getDocRef', () => {
    it('returns a doc ref for a given id', () => {
      const mockDocRefObj = { id: 'reg-1' };
      const mockDocFn = vi.fn().mockReturnValue(mockDocRefObj);
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const ref = RegistrationRepository.getDocRef('reg-1');

      expect(ref).toBe(mockDocRefObj);
      expect(mockDocFn).toHaveBeenCalledWith('reg-1');
    });

    it('returns an auto-generated doc ref when no id is provided', () => {
      const mockAutoRef = { id: 'auto-id' };
      const mockDocFn = vi.fn().mockReturnValue(mockAutoRef);
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const ref = RegistrationRepository.getDocRef();

      expect(ref).toBe(mockAutoRef);
      expect(mockDocFn).toHaveBeenCalledWith();
    });
  });

  // ── Square refunds (#144) ────────────────────────────────────────────

  describe('findBySquarePaymentId', () => {
    function setupQuery(docs: Array<{ id: string; data: Record<string, unknown> }>) {
      const mockGet = vi
        .fn()
        .mockResolvedValue({ docs: docs.map((d) => mockDocSnapshot(d.id, d.data)) });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      vi.mocked(db.collection).mockReturnValue({
        where: mockWhere,
      } as unknown as ReturnType<typeof db.collection>);
      return { mockWhere, mockLimit };
    }

    it('matches one registration on squarePaymentId', async () => {
      const { mockWhere, mockLimit } = setupQuery([
        { id: 'reg-1', data: firestoreRegData() },
      ]);
      const result = await RegistrationRepository.findBySquarePaymentId('sq-pay-1');
      expect(mockWhere).toHaveBeenCalledWith('squarePaymentId', '==', 'sq-pay-1');
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(result?.id).toBe('reg-1');
    });

    it('returns undefined with no match', async () => {
      setupQuery([]);
      expect(await RegistrationRepository.findBySquarePaymentId('nope')).toBeUndefined();
    });
  });

  describe('findWithRefunds', () => {
    it('reads every registration with money refunded', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        docs: [
          mockDocSnapshot('reg-1', firestoreRegData({ refundedAmountCents: 2000 })),
          mockDocSnapshot('reg-gone', null),
        ],
      });
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      vi.mocked(db.collection).mockReturnValue({
        where: mockWhere,
      } as unknown as ReturnType<typeof db.collection>);

      const result = await RegistrationRepository.findWithRefunds();
      expect(mockWhere).toHaveBeenCalledWith('refundedAmountCents', '>', 0);
      expect(result.map((r) => r.id)).toEqual(['reg-1']);
      expect(result[0].refundedAmountCents).toBe(2000);
    });
  });

  describe('applySquareRefund', () => {
    const at = new Date('2026-10-15T15:00:00Z');

    function setupTransaction(data: Record<string, unknown> | null) {
      const docRef = { id: 'reg-1' };
      const txGet = vi.fn().mockResolvedValue(mockDocSnapshot('reg-1', data));
      const txUpdate = vi.fn();
      vi.mocked(db.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue(docRef),
      } as unknown as ReturnType<typeof db.collection>);
      vi.mocked(db.runTransaction).mockImplementation((async (
        fn: (tx: unknown) => Promise<unknown>
      ) => fn({ get: txGet, update: txUpdate })) as unknown as typeof db.runTransaction);
      return { docRef, txGet, txUpdate };
    }

    it('marks a full refund refunded inside the transaction', async () => {
      const { docRef, txGet, txUpdate } = setupTransaction(firestoreRegData());
      const result = await RegistrationRepository.applySquareRefund('reg-1', {
        refundId: 'rf-1',
        amountCents: 5300,
        at,
      });
      expect(txGet).toHaveBeenCalledWith(docRef);
      expect(txUpdate).toHaveBeenCalledWith(
        docRef,
        expect.objectContaining({
          status: 'refunded',
          refundedAt: at,
          refundedAmountCents: 5300,
          squareRefundId: 'rf-1',
          squareRefundIds: ['rf-1'],
          lastRefundAt: at,
          updatedAt: expect.any(Date),
        })
      );
      expect(result?.outcome).toBe('full');
      expect(result?.registration.status).toBe('refunded');
    });

    it('records a partial refund without changing the status', async () => {
      const { txUpdate } = setupTransaction(firestoreRegData());
      const result = await RegistrationRepository.applySquareRefund('reg-1', {
        refundId: 'rf-1',
        amountCents: 2000,
        at,
      });
      const written = txUpdate.mock.calls[0][1];
      expect(written).not.toHaveProperty('status');
      expect(written).toMatchObject({ refundedAmountCents: 2000, squareRefundIds: ['rf-1'] });
      expect(result?.outcome).toBe('partial');
      expect(result?.registration.status).toBe('confirmed');
    });

    it('reads squareRefundIds back and writes nothing for a refund already counted', async () => {
      const { txUpdate } = setupTransaction(
        firestoreRegData({ refundedAmountCents: 2000, squareRefundIds: ['rf-1', 42] })
      );
      const result = await RegistrationRepository.applySquareRefund('reg-1', {
        refundId: 'rf-1',
        amountCents: 2000,
        at,
      });
      expect(txUpdate).not.toHaveBeenCalled();
      expect(result?.outcome).toBe('duplicate');
      expect(result?.registration.squareRefundIds).toEqual(['rf-1']);
    });

    it('returns undefined when the registration is gone', async () => {
      const { txUpdate } = setupTransaction(null);
      const result = await RegistrationRepository.applySquareRefund('reg-1', {
        refundId: 'rf-1',
        amountCents: 2000,
        at,
      });
      expect(result).toBeUndefined();
      expect(txUpdate).not.toHaveBeenCalled();
    });
  });

  it('maps lastRefundAt and treats an empty squareRefundIds as absent', async () => {
    const lastRefundAt = new Date('2026-10-15T15:00:00Z');
    vi.mocked(db.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi
          .fn()
          .mockResolvedValue(
            mockDocSnapshot('reg-1', firestoreRegData({ lastRefundAt, squareRefundIds: [] }))
          ),
      }),
    } as unknown as ReturnType<typeof db.collection>);
    const reg = await RegistrationRepository.findById('reg-1');
    expect(reg?.lastRefundAt).toEqual(lastRefundAt);
    expect(reg?.squareRefundIds).toBeUndefined();
  });

  // ── Ambiguous Square refunds flagged for review (#144) ───────────────

  describe('findAll* by payment / order and review queries', () => {
    function setupWhere(docs: Array<{ id: string; data: Record<string, unknown> | null }>) {
      const mockGet = vi
        .fn()
        .mockResolvedValue({ docs: docs.map((d) => mockDocSnapshot(d.id, d.data)) });
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      vi.mocked(db.collection).mockReturnValue({
        where: mockWhere,
      } as unknown as ReturnType<typeof db.collection>);
      return mockWhere;
    }

    it('findAllBySquarePaymentId returns every registration on the payment', async () => {
      const where = setupWhere([
        { id: 'reg-1', data: firestoreRegData({ source: 'pos' }) },
        { id: 'reg-2', data: firestoreRegData({ source: 'pos' }) },
        { id: 'gone', data: null },
      ]);
      const result = await RegistrationRepository.findAllBySquarePaymentId('sq-pay-1');
      expect(where).toHaveBeenCalledWith('squarePaymentId', '==', 'sq-pay-1');
      expect(result.map((r) => r.id)).toEqual(['reg-1', 'reg-2']);
    });

    it('findAllBySquareOrderId returns every registration on the order', async () => {
      const where = setupWhere([{ id: 'reg-1', data: firestoreRegData() }]);
      const result = await RegistrationRepository.findAllBySquareOrderId('sq-ord-1');
      expect(where).toHaveBeenCalledWith('squareOrderId', '==', 'sq-ord-1');
      expect(result).toHaveLength(1);
    });

    it('findWithRefundReviewSince reads flagged registrations and maps the review', async () => {
      const since = new Date('2026-07-17T00:00:00Z');
      const flaggedAt = new Date('2026-10-15T15:00:00Z');
      const where = setupWhere([
        {
          id: 'reg-1',
          data: firestoreRegData({
            refundReviewAt: flaggedAt,
            refundReviewAmountCents: 10000,
            refundReviewId: 'rf-1',
          }),
        },
        { id: 'gone', data: null },
      ]);
      const [reg] = await RegistrationRepository.findWithRefundReviewSince(since);
      expect(where).toHaveBeenCalledWith('refundReviewAt', '>', since);
      expect(reg).toMatchObject({
        refundReviewAt: flaggedAt,
        refundReviewAmountCents: 10000,
        refundReviewId: 'rf-1',
      });
    });
  });

  describe('flagSquareRefundForReview', () => {
    const at = new Date('2026-10-15T15:00:00Z');

    function setupTransaction(data: Record<string, unknown> | null) {
      const docRef = { id: 'reg-1' };
      const txUpdate = vi.fn();
      vi.mocked(db.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue(docRef),
      } as unknown as ReturnType<typeof db.collection>);
      vi.mocked(db.runTransaction).mockImplementation((async (
        fn: (tx: unknown) => Promise<unknown>
      ) =>
        fn({
          get: vi.fn().mockResolvedValue(mockDocSnapshot('reg-1', data)),
          update: txUpdate,
        })) as unknown as typeof db.runTransaction);
      return { docRef, txUpdate };
    }

    it('notes the refund and leaves status and amount alone', async () => {
      const { docRef, txUpdate } = setupTransaction(firestoreRegData({ source: 'pos' }));
      const result = await RegistrationRepository.flagSquareRefundForReview('reg-1', {
        refundId: 'rf-1',
        amountCents: 10000,
        at,
      });
      expect(result).toEqual({ outcome: 'flagged' });
      const written = txUpdate.mock.calls[0][1];
      expect(txUpdate.mock.calls[0][0]).toBe(docRef);
      expect(written).toMatchObject({
        squareRefundIds: ['rf-1'],
        refundReviewAt: at,
        refundReviewAmountCents: 10000,
        refundReviewId: 'rf-1',
        lastRefundAt: at,
      });
      expect(written).not.toHaveProperty('status');
      expect(written).not.toHaveProperty('refundedAmountCents');
    });

    it('writes nothing for a refund already noted', async () => {
      const { txUpdate } = setupTransaction(firestoreRegData({ squareRefundIds: ['rf-1'] }));
      const result = await RegistrationRepository.flagSquareRefundForReview('reg-1', {
        refundId: 'rf-1',
        amountCents: 10000,
        at,
      });
      expect(result).toEqual({ outcome: 'duplicate' });
      expect(txUpdate).not.toHaveBeenCalled();
    });

    it('returns undefined when the registration is gone', async () => {
      setupTransaction(null);
      expect(
        await RegistrationRepository.flagSquareRefundForReview('reg-1', {
          refundId: 'rf-1',
          amountCents: 1,
          at,
        })
      ).toBeUndefined();
    });
  });

  describe('markRefundedInSquare', () => {
    const at = new Date('2026-10-16T12:00:00Z');

    function setupDoc(after: Record<string, unknown> | null) {
      const update = vi.fn().mockResolvedValue(undefined);
      const get = vi.fn().mockResolvedValue(mockDocSnapshot('reg-1', after));
      vi.mocked(db.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue({ update, get }),
      } as unknown as ReturnType<typeof db.collection>);
      return update;
    }

    const flagged = {
      id: 'reg-1',
      classId: 'class-1',
      customerEmail: 'alice@example.com',
      customerName: 'Alice',
      quantity: 1,
      pricePaidCents: 5300,
      subtotalCents: 5000,
      taxAmountCents: 300,
      taxRatePercent: 6,
      status: 'confirmed' as const,
      source: 'pos' as const,
      refundReviewAt: new Date('2026-10-15T15:00:00Z'),
      refundReviewAmountCents: 2000,
      refundReviewId: 'rf-1',
      createdAt: new Date('2026-02-01'),
      updatedAt: new Date('2026-02-02'),
    };

    it('marks it refunded for the flagged amount and clears the review with nulls', async () => {
      const update = setupDoc(
        firestoreRegData({
          status: 'refunded',
          refundedAmountCents: 2000,
          refundReviewAt: null,
          refundReviewAmountCents: null,
          refundReviewId: null,
        })
      );
      const result = await RegistrationRepository.markRefundedInSquare(flagged, at);
      expect(update).toHaveBeenCalledWith({
        status: 'refunded',
        refundedAt: at,
        lastRefundAt: at,
        refundedAmountCents: 2000,
        squareRefundId: 'rf-1',
        refundReviewAt: null,
        refundReviewAmountCents: null,
        refundReviewId: null,
        updatedAt: at,
      });
      expect(result.refundReviewAt).toBeUndefined();
      expect(result.refundReviewAmountCents).toBeUndefined();
      expect(result.refundReviewId).toBeUndefined();
    });

    it('records the whole price with no flagged refund, and no refund id', async () => {
      const update = setupDoc(firestoreRegData({ status: 'refunded' }));
      await RegistrationRepository.markRefundedInSquare({
        ...flagged,
        refundReviewAt: undefined,
        refundReviewAmountCents: undefined,
        refundReviewId: undefined,
      });
      const written = update.mock.calls[0][0];
      expect(written.refundedAmountCents).toBe(5300);
      expect(written).not.toHaveProperty('squareRefundId');
      expect(written.refundedAt).toBeInstanceOf(Date);
    });

    it('throws if the registration vanished', async () => {
      setupDoc(null);
      await expect(RegistrationRepository.markRefundedInSquare(flagged, at)).rejects.toThrow(
        'not found after update'
      );
    });
  });
});

