import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  SyncConflict,
  CreateSyncConflictInput,
  SyncConflictStatus,
} from '@maple/ts/domain';

// Mock the database config module
vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
  },
}));

// Import after mocking
import { SyncConflictRepository } from './sync-conflict.repository';
import { db } from './utilities/database.config';

describe('SyncConflictRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockConflictDoc = (
    id: string,
    overrides: Partial<{
      productId: string;
      type: string;
      status: SyncConflictStatus;
      localQuantity: number;
      externalQuantity: number;
      system: string;
      resolution: string;
      resolvedAt: Date;
      resolvedBy: string;
      notes: string;
    }> = {}
  ) => ({
    exists: true,
    id,
    data: () => ({
      productId: overrides.productId ?? 'prod-123',
      type: overrides.type ?? 'quantity_mismatch',
      detectedAt: { toDate: () => new Date('2026-01-25T10:00:00') },
      localState: {
        quantity: overrides.localQuantity ?? 5,
        price: 2500,
        name: 'Test Product',
      },
      externalState: {
        system: overrides.system ?? 'square',
        quantity: overrides.externalQuantity ?? 3,
        price: 2500,
        name: 'Test Product',
      },
      status: overrides.status ?? 'pending',
      resolution: overrides.resolution,
      resolvedAt: overrides.resolvedAt
        ? { toDate: () => overrides.resolvedAt }
        : undefined,
      resolvedBy: overrides.resolvedBy,
      notes: overrides.notes,
    }),
  });

  describe('findById', () => {
    it('returns conflict when found', async () => {
      const mockDoc = createMockConflictDoc('conflict-001');

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await SyncConflictRepository.findById('conflict-001');

      expect(result).toBeDefined();
      expect(result?.id).toBe('conflict-001');
      expect(result?.productId).toBe('prod-123');
      expect(result?.type).toBe('quantity_mismatch');
      expect(result?.status).toBe('pending');
      expect(result?.localState.quantity).toBe(5);
      expect(result?.externalState.quantity).toBe(3);
      expect(result?.externalState.system).toBe('square');
    });

    it('returns undefined for non-existent conflict', async () => {
      const mockDoc = {
        exists: false,
        id: 'nonexistent',
        data: () => undefined,
      };

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await SyncConflictRepository.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns all conflicts', async () => {
      const mockDocs = [
        createMockConflictDoc('conflict-001'),
        createMockConflictDoc('conflict-002', {
          productId: 'prod-456',
          type: 'price_mismatch',
        }),
        createMockConflictDoc('conflict-003', {
          productId: 'prod-789',
          status: 'resolved',
          resolution: 'use_local',
        }),
      ];

      const mockSnapshot = { docs: mockDocs };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const results = await SyncConflictRepository.findAll();

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('conflict-001');
      expect(results[1].type).toBe('price_mismatch');
      expect(results[2].status).toBe('resolved');
    });

    it('filters by status when provided', async () => {
      const mockDocs = [createMockConflictDoc('conflict-pending')];

      const mockSnapshot = { docs: mockDocs };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await SyncConflictRepository.findAll({ status: 'pending' });

      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'pending');
    });

    it('filters by type when provided', async () => {
      const mockSnapshot = { docs: [] };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await SyncConflictRepository.findAll({ type: 'quantity_mismatch' });

      expect(mockWhere).toHaveBeenCalledWith('type', '==', 'quantity_mismatch');
    });

    it('filters by system when provided', async () => {
      const mockSnapshot = { docs: [] };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await SyncConflictRepository.findAll({ system: 'square' });

      expect(mockWhere).toHaveBeenCalledWith(
        'externalState.system',
        '==',
        'square'
      );
    });
  });

  describe('findPending', () => {
    it('returns only pending conflicts', async () => {
      const mockDocs = [
        createMockConflictDoc('pending-1', { status: 'pending' }),
        createMockConflictDoc('pending-2', { status: 'pending' }),
      ];

      const mockSnapshot = { docs: mockDocs };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const results = await SyncConflictRepository.findPending();

      expect(results).toHaveLength(2);
      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'pending');
    });
  });

  describe('findExistingConflict', () => {
    it('returns existing pending conflict for product/type/system', async () => {
      const mockDoc = createMockConflictDoc('existing-conflict');

      const mockSnapshot = { empty: false, docs: [mockDoc] };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere4 = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere3 = vi.fn().mockReturnValue({ where: mockWhere4 });
      const mockWhere2 = vi.fn().mockReturnValue({ where: mockWhere3 });
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere1 });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await SyncConflictRepository.findExistingConflict(
        'prod-123',
        'quantity_mismatch',
        'square'
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('existing-conflict');
    });

    it('returns undefined when no existing conflict', async () => {
      const mockSnapshot = { empty: true, docs: [] };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere4 = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere3 = vi.fn().mockReturnValue({ where: mockWhere4 });
      const mockWhere2 = vi.fn().mockReturnValue({ where: mockWhere3 });
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere1 });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await SyncConflictRepository.findExistingConflict(
        'prod-new',
        'price_mismatch',
        'etsy'
      );

      expect(result).toBeUndefined();
    });
  });

  describe('create', () => {
    it('creates conflict with correct fields', async () => {
      const input: CreateSyncConflictInput = {
        productId: 'prod-new',
        type: 'quantity_mismatch',
        detectedAt: new Date('2026-01-25T12:00:00'),
        localState: { quantity: 10, price: 3000, name: 'New Product' },
        externalState: {
          system: 'square',
          quantity: 7,
          price: 3000,
          name: 'New Product',
        },
      };

      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'conflict-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await SyncConflictRepository.create(input);

      expect(result.id).toBe('conflict-new');
      expect(result.productId).toBe('prod-new');
      expect(result.type).toBe('quantity_mismatch');
      expect(result.status).toBe('pending');
      expect(result.localState.quantity).toBe(10);
      expect(result.externalState.quantity).toBe(7);

      expect(mockSet).toHaveBeenCalled();
      expect(savedData.productId).toBe('prod-new');
      expect(savedData.status).toBe('pending');
    });
  });

  describe('resolve', () => {
    it('updates status, resolution, resolvedBy, and resolvedAt', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const resolvedDoc = createMockConflictDoc('conflict-resolve', {
        status: 'resolved',
        resolution: 'use_local',
        resolvedBy: 'admin-123',
        resolvedAt: new Date(),
      });

      const mockGet = vi.fn().mockResolvedValue(resolvedDoc);
      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await SyncConflictRepository.resolve(
        'conflict-resolve',
        'use_local',
        'admin-123'
      );

      expect(mockUpdate).toHaveBeenCalled();
      expect(updatedFields.status).toBe('resolved');
      expect(updatedFields.resolution).toBe('use_local');
      expect(updatedFields.resolvedBy).toBe('admin-123');
      expect(updatedFields.resolvedAt).toBeInstanceOf(Date);
      expect(result.status).toBe('resolved');
    });

    it('includes notes when provided', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const resolvedDoc = createMockConflictDoc('conflict-notes', {
        status: 'resolved',
        resolution: 'manual',
        resolvedBy: 'admin-123',
        notes: 'Fixed manually in Square dashboard',
      });

      const mockGet = vi.fn().mockResolvedValue(resolvedDoc);
      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await SyncConflictRepository.resolve(
        'conflict-notes',
        'manual',
        'admin-123',
        'Fixed manually in Square dashboard'
      );

      expect(updatedFields.notes).toBe('Fixed manually in Square dashboard');
    });
  });

  describe('ignore', () => {
    it('sets resolution to ignored', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const ignoredDoc = createMockConflictDoc('conflict-ignore', {
        status: 'resolved',
        resolution: 'ignored',
        resolvedBy: 'admin-456',
      });

      const mockGet = vi.fn().mockResolvedValue(ignoredDoc);
      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await SyncConflictRepository.ignore(
        'conflict-ignore',
        'admin-456',
        'Intentional price difference'
      );

      expect(updatedFields.resolution).toBe('ignored');
      expect(updatedFields.notes).toBe('Intentional price difference');
      expect(result.resolution).toBe('ignored');
    });
  });

  describe('getSummary', () => {
    it('returns correct counts by status, type, and system', async () => {
      const mockDocs = [
        createMockConflictDoc('c1', {
          status: 'pending',
          type: 'quantity_mismatch',
          system: 'square',
        }),
        createMockConflictDoc('c2', {
          status: 'pending',
          type: 'quantity_mismatch',
          system: 'square',
        }),
        createMockConflictDoc('c3', {
          status: 'pending',
          type: 'price_mismatch',
          system: 'etsy',
        }),
        createMockConflictDoc('c4', {
          status: 'resolved',
          resolution: 'use_local',
        }),
        createMockConflictDoc('c5', {
          status: 'resolved',
          resolution: 'ignored',
        }),
      ];

      const mockSnapshot = { docs: mockDocs };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const summary = await SyncConflictRepository.getSummary();

      expect(summary.pending).toBe(3);
      expect(summary.resolved).toBe(1); // Only non-ignored resolved
      expect(summary.ignored).toBe(1);
      expect(summary.byType.quantity_mismatch).toBe(2);
      expect(summary.byType.price_mismatch).toBe(1);
      expect(summary.bySystem.square).toBe(2);
      expect(summary.bySystem.etsy).toBe(1);
    });

    it('returns zero counts when no conflicts', async () => {
      const mockSnapshot = { docs: [] };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const summary = await SyncConflictRepository.getSummary();

      expect(summary.pending).toBe(0);
      expect(summary.resolved).toBe(0);
      expect(summary.ignored).toBe(0);
      expect(summary.byType.quantity_mismatch).toBe(0);
      expect(summary.bySystem.square).toBe(0);
    });
  });

  describe('delete', () => {
    it('deletes the conflict document', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockDocRef = vi.fn().mockReturnValue({ delete: mockDelete });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await SyncConflictRepository.delete('conflict-to-delete');

      expect(mockDocRef).toHaveBeenCalledWith('conflict-to-delete');
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('updateState', () => {
    it('updates local and external state with new detectedAt', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const updatedDoc = createMockConflictDoc('conflict-update', {
        localQuantity: 8,
        externalQuantity: 4,
      });

      const mockGet = vi.fn().mockResolvedValue(updatedDoc);
      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await SyncConflictRepository.updateState(
        'conflict-update',
        { quantity: 8, price: 2500, name: 'Test Product' },
        { system: 'square', quantity: 4, price: 2500, name: 'Test Product' }
      );

      expect(mockUpdate).toHaveBeenCalled();
      expect(updatedFields.localState).toEqual({
        quantity: 8,
        price: 2500,
        name: 'Test Product',
      });
      expect(updatedFields.externalState).toEqual({
        system: 'square',
        quantity: 4,
        price: 2500,
        name: 'Test Product',
      });
      expect(updatedFields.detectedAt).toBeInstanceOf(Date);
    });
  });
});
