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
});
