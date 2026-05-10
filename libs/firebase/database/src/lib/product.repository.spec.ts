import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product, CreateProductInput, SquareProductResult } from '@maple/ts/domain';

// Mock the database config module
vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
  },
}));

// Import after mocking
import { ProductRepository } from './product.repository';
import { db } from './utilities/database.config';

describe('ProductRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('returns product with categoryId when present in document', async () => {
      const mockDocData = {
        artistId: 'artist-123',
        categoryId: 'cat-456',
        customCommissionRate: 0.25,
        status: 'active',
        createdAt: { toDate: () => new Date('2024-01-01') },
        updatedAt: { toDate: () => new Date('2024-01-02') },
        squareItemId: 'sq-item-001',
        squareVariationId: 'sq-var-001',
        squareCatalogVersion: 1,
        squareLocationId: 'sq-loc-001',
        squareCache: {
          name: 'Test Product',
          description: 'A test product',
          priceCents: 2500,
          quantity: 5,
          sku: 'prd_test123',
          imageUrl: 'https://example.com/image.jpg',
          syncedAt: { toDate: () => new Date('2024-01-02') },
        },
      };

      const mockDoc = {
        exists: true,
        id: 'prod-001',
        data: () => mockDocData,
      };

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ProductRepository.findById('prod-001');

      expect(result).toBeDefined();
      expect(result?.id).toBe('prod-001');
      expect(result?.categoryId).toBe('cat-456');
      expect(result?.artistId).toBe('artist-123');
      expect(result?.status).toBe('active');
    });

    it('returns product with undefined categoryId when not present in document', async () => {
      const mockDocData = {
        artistId: 'artist-123',
        // categoryId intentionally omitted
        status: 'active',
        createdAt: { toDate: () => new Date('2024-01-01') },
        updatedAt: { toDate: () => new Date('2024-01-02') },
        squareItemId: 'sq-item-001',
        squareVariationId: 'sq-var-001',
        squareCache: {
          name: 'Test Product',
          priceCents: 2500,
          quantity: 5,
          sku: 'prd_test123',
          syncedAt: { toDate: () => new Date('2024-01-02') },
        },
      };

      const mockDoc = {
        exists: true,
        id: 'prod-002',
        data: () => mockDocData,
      };

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ProductRepository.findById('prod-002');

      expect(result).toBeDefined();
      expect(result?.categoryId).toBeUndefined();
    });

    it('returns undefined for non-existent document', async () => {
      const mockDoc = {
        exists: false,
        id: 'prod-nonexistent',
        data: () => undefined,
      };

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ProductRepository.findById('prod-nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('create', () => {
    it('includes categoryId in created product', async () => {
      const input: CreateProductInput = {
        artistId: 'artist-123',
        categoryId: 'cat-789',
        status: 'active',
        name: 'New Product',
        description: 'A new product',
        priceCents: 3500,
        quantity: 10,
      };

      const squareResult: SquareProductResult = {
        squareItemId: 'sq-item-new',
        squareVariationId: 'sq-var-new',
        squareCatalogVersion: 1,
        squareLocationId: 'sq-loc-001',
        sku: 'prd_newsku',
        variations: [
          { variantId: 'var-new', squareVariationId: 'sq-var-new', sku: 'prd_newsku' },
        ],
      };

      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'prod-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ProductRepository.create(input, squareResult);

      // Verify categoryId is in the result
      expect(result.categoryId).toBe('cat-789');
      expect(result.id).toBe('prod-new');
      expect(result.artistId).toBe('artist-123');

      // Verify categoryId was saved to Firestore
      expect(mockSet).toHaveBeenCalled();
      expect(savedData.categoryId).toBe('cat-789');
    });

    it('handles undefined categoryId in create', async () => {
      const input: CreateProductInput = {
        artistId: 'artist-123',
        // categoryId intentionally omitted
        status: 'active',
        name: 'Product without category',
        priceCents: 2000,
        quantity: 5,
      };

      const squareResult: SquareProductResult = {
        squareItemId: 'sq-item-nocat',
        squareVariationId: 'sq-var-nocat',
        squareCatalogVersion: 1,
        squareLocationId: 'sq-loc-001',
        sku: 'prd_nocat',
        variations: [
          { variantId: 'var-nocat', squareVariationId: 'sq-var-nocat', sku: 'prd_nocat' },
        ],
      };

      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'prod-nocat',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ProductRepository.create(input, squareResult);

      expect(result.categoryId).toBeUndefined();
      expect(savedData.categoryId).toBeUndefined();
    });

    it('writes etsyListingId and etsyCache atomically when extras are passed', async () => {
      const input: CreateProductInput = {
        artistId: 'artist-1',
        status: 'active',
        name: 'Etsy-imported product',
        priceCents: 4500,
        quantity: 3,
      };

      const squareResult: SquareProductResult = {
        squareItemId: 'sq-item-etsy',
        squareVariationId: 'sq-var-etsy',
        squareCatalogVersion: 1,
        squareLocationId: 'sq-loc-001',
        sku: 'prd_etsy',
        variations: [
          { variantId: 'var-etsy', squareVariationId: 'sq-var-etsy', sku: 'prd_etsy' },
        ],
      };

      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });
      const mockDocRef = vi
        .fn()
        .mockReturnValue({ id: 'prod-etsy', set: mockSet });
      vi.mocked(db.collection).mockImplementation(
        vi.fn().mockReturnValue({ doc: mockDocRef })
      );

      const syncedAt = new Date('2024-10-01T00:00:00Z');
      const result = await ProductRepository.create(input, squareResult, {
        etsyListingId: '1234567890',
        etsyCache: {
          title: 'Etsy-imported product',
          taxonomyId: 1,
          priceCents: 4500,
          quantity: 3,
          state: 'active',
          syncedAt,
        },
      });

      // Both Etsy linkage fields land on the returned domain object …
      expect(result.etsyListingId).toBe('1234567890');
      expect(result.etsyCache?.title).toBe('Etsy-imported product');
      expect(result.etsyCache?.syncedAt).toBe(syncedAt);

      // … and on the Firestore doc body, in a single set() call. This is the
      // race-closing assertion: prior versions wrote etsyListingId via a
      // follow-up updateEtsyCache, leaving an orphan window if the import
      // function timed out between the two writes.
      expect(mockSet).toHaveBeenCalledTimes(1);
      expect(savedData['etsyListingId']).toBe('1234567890');
      // Listing-level Etsy fields land on the Firestore doc; per-variant
      // priceCents/quantity are intentionally derived from variants[0] at
      // read time (see EtsyCache backward-compat shape) so they're not
      // serialized here.
      const cache = savedData['etsyCache'] as Record<string, unknown>;
      expect(cache).toMatchObject({
        title: 'Etsy-imported product',
        state: 'active',
      });
    });
  });

  describe('update', () => {
    it('updates categoryId when provided', async () => {
      const existingProduct: Product = {
        id: 'prod-update',
        artistId: 'artist-123',
        categoryId: 'cat-old',
        status: 'active',
        squareItemId: 'sq-item-001',
        squareVariationId: 'sq-var-001',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        variants: [
          { id: 'var-001', label: 'Regular', sku: 'prd_existing', priceCents: 2500, quantity: 5, squareVariationId: 'sq-var-001' },
        ],
        squareCache: {
          name: 'Existing Product',
          priceCents: 2500,
          quantity: 5,
          sku: 'prd_existing',
          syncedAt: new Date('2024-01-02'),
        },
      };

      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      // Mock for reading back the updated document
      const mockDocDataAfterUpdate = {
        ...existingProduct,
        categoryId: 'cat-new',
        createdAt: { toDate: () => existingProduct.createdAt },
        updatedAt: { toDate: () => new Date() },
        squareCache: {
          ...existingProduct.squareCache,
          syncedAt: { toDate: () => existingProduct.squareCache.syncedAt },
        },
      };

      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        id: 'prod-update',
        data: () => mockDocDataAfterUpdate,
      });

      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ProductRepository.update({
        id: 'prod-update',
        categoryId: 'cat-new',
      });

      // Verify update was called with categoryId
      expect(mockUpdate).toHaveBeenCalled();
      expect(updatedFields.categoryId).toBe('cat-new');
      expect(result.categoryId).toBe('cat-new');
    });

    it('does not update categoryId when not provided', async () => {
      const existingProduct = {
        artistId: 'artist-123',
        categoryId: 'cat-unchanged',
        status: 'active',
        createdAt: { toDate: () => new Date('2024-01-01') },
        updatedAt: { toDate: () => new Date() },
        squareItemId: 'sq-item-001',
        squareVariationId: 'sq-var-001',
        squareCache: {
          name: 'Existing Product',
          priceCents: 2500,
          quantity: 5,
          sku: 'prd_existing',
          syncedAt: { toDate: () => new Date('2024-01-02') },
        },
      };

      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        id: 'prod-update',
        data: () => existingProduct,
      });

      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ProductRepository.update({
        id: 'prod-update',
        status: 'draft', // Only updating status, not categoryId
      });

      // Verify categoryId was NOT in the update call
      expect(mockUpdate).toHaveBeenCalled();
      expect(updatedFields.status).toBe('draft');
      expect(updatedFields.categoryId).toBeUndefined();
    });

    it('can clear categoryId by setting to undefined', async () => {
      const existingProduct = {
        artistId: 'artist-123',
        categoryId: 'cat-to-clear',
        status: 'active',
        createdAt: { toDate: () => new Date('2024-01-01') },
        updatedAt: { toDate: () => new Date() },
        squareItemId: 'sq-item-001',
        squareVariationId: 'sq-var-001',
        squareCache: {
          name: 'Product to clear category',
          priceCents: 2500,
          quantity: 5,
          sku: 'prd_clear',
          syncedAt: { toDate: () => new Date('2024-01-02') },
        },
      };

      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDocDataAfterUpdate = {
        ...existingProduct,
        categoryId: undefined,
      };

      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        id: 'prod-clear',
        data: () => mockDocDataAfterUpdate,
      });

      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ProductRepository.update({
        id: 'prod-clear',
        categoryId: undefined,
      });

      // When categoryId is explicitly undefined, it should be in allowedUpdates
      expect(mockUpdate).toHaveBeenCalled();
      expect(updatedFields.categoryId).toBeUndefined();
      expect(result.categoryId).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns products with categoryId mapped correctly', async () => {
      const mockDocs = [
        {
          exists: true,
          id: 'prod-001',
          data: () => ({
            artistId: 'artist-1',
            categoryId: 'cat-001',
            status: 'active',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() },
            squareItemId: 'sq-1',
            squareVariationId: 'sq-v-1',
            squareCache: {
              name: 'Product 1',
              priceCents: 1000,
              quantity: 1,
              sku: 'sku1',
              syncedAt: { toDate: () => new Date() },
            },
          }),
        },
        {
          exists: true,
          id: 'prod-002',
          data: () => ({
            artistId: 'artist-2',
            categoryId: 'cat-002',
            status: 'active',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() },
            squareItemId: 'sq-2',
            squareVariationId: 'sq-v-2',
            squareCache: {
              name: 'Product 2',
              priceCents: 2000,
              quantity: 2,
              sku: 'sku2',
              syncedAt: { toDate: () => new Date() },
            },
          }),
        },
        {
          exists: true,
          id: 'prod-003',
          data: () => ({
            artistId: 'artist-3',
            // No categoryId - should be undefined
            status: 'draft',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() },
            squareItemId: 'sq-3',
            squareVariationId: 'sq-v-3',
            squareCache: {
              name: 'Product 3',
              priceCents: 3000,
              quantity: 3,
              sku: 'sku3',
              syncedAt: { toDate: () => new Date() },
            },
          }),
        },
      ];

      const mockSnapshot = { docs: mockDocs };
      const mockGet = vi.fn().mockResolvedValue(mockSnapshot);
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const results = await ProductRepository.findAll();

      expect(results).toHaveLength(3);
      expect(results[0].categoryId).toBe('cat-001');
      expect(results[1].categoryId).toBe('cat-002');
      expect(results[2].categoryId).toBeUndefined();
    });
  });
});
