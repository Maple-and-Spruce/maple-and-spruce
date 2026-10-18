import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  products: {
    findAll: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
  },
  categories: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorderAll: vi.fn(),
    countProductsWithCategory: vi.fn(),
  },
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(
      public code: string,
      m: string
    ) {
      super(m);
    }
  }
  // Each route records the roles it was gated on and its handler.
  const endpoint = {
    requiringRole: (roles: unknown) => ({
      asRoute: (handler: unknown) => ({ roles, handler }),
    }),
  };
  return {
    Functions: {
      endpoint,
      router: (_name: string, routes: unknown) => routes,
    },
    Role: { Admin: 'admin', Clerk: 'clerk' },
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} ${id} not found`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  ProductRepository: mocks.products,
  CategoryRepository: mocks.categories,
}));

import { products } from './products.router';

type Route = {
  roles: unknown;
  handler: (data: unknown, context: unknown) => Promise<unknown>;
};
const routes = products as unknown as Record<string, Route>;

const PRODUCT = { id: 'prod-1', artistId: 'artist-1', status: 'active' };
const CATEGORY = { id: 'cat-1', name: 'Pottery', order: 0 };

describe('products router (#68)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    'getProducts',
    'getProduct',
    'deleteProduct',
    'getCategories',
    'createCategory',
    'updateCategory',
    'reorderCategories',
    'deleteCategory',
  ])('%s is open to admins and the clerk', (route) => {
    expect(routes[route].roles).toEqual(['admin', 'clerk']);
  });

  it('leaves the Square-backed product writes to maple-square', () => {
    expect(routes['createProduct']).toBeUndefined();
    expect(routes['updateProduct']).toBeUndefined();
    expect(routes['uploadProductImage']).toBeUndefined();
  });

  it('leaves the class-category gallery upload to the classes domain', () => {
    expect(routes['uploadCategoryGalleryImage']).toBeUndefined();
  });

  describe('products', () => {
    it('lists products with the artist and status filters', async () => {
      mocks.products.findAll.mockResolvedValue([PRODUCT]);

      const result = await routes['getProducts'].handler(
        { artistId: 'artist-1', status: 'active', ignored: true },
        {}
      );

      expect(mocks.products.findAll).toHaveBeenCalledWith({
        artistId: 'artist-1',
        status: 'active',
      });
      expect(result).toEqual({ products: [PRODUCT] });
    });

    it('reads one product', async () => {
      mocks.products.findById.mockResolvedValue(PRODUCT);

      await expect(
        routes['getProduct'].handler({ id: 'prod-1' }, {})
      ).resolves.toEqual({ product: PRODUCT });
    });

    it('reports a missing product', async () => {
      mocks.products.findById.mockResolvedValue(undefined);

      await expect(
        routes['getProduct'].handler({ id: 'nope' }, {})
      ).rejects.toThrow('Product nope not found');
    });

    it('deletes a product that exists, and only then', async () => {
      mocks.products.findById.mockResolvedValueOnce(undefined);
      await expect(
        routes['deleteProduct'].handler({ id: 'nope' }, {})
      ).rejects.toThrow('Product nope not found');
      expect(mocks.products.delete).not.toHaveBeenCalled();

      mocks.products.findById.mockResolvedValueOnce(PRODUCT);
      await expect(
        routes['deleteProduct'].handler({ id: 'prod-1' }, {})
      ).resolves.toEqual({ success: true });
      expect(mocks.products.delete).toHaveBeenCalledWith('prod-1');
    });
  });

  describe('categories', () => {
    it('lists categories', async () => {
      mocks.categories.findAll.mockResolvedValue([CATEGORY]);

      await expect(routes['getCategories'].handler({}, {})).resolves.toEqual({
        categories: [CATEGORY],
      });
    });

    it('creates a valid category with an unused name', async () => {
      mocks.categories.findByName.mockResolvedValue(undefined);
      mocks.categories.create.mockResolvedValue(CATEGORY);

      const result = await routes['createCategory'].handler(
        { name: 'Pottery', order: 0 },
        {}
      );

      expect(mocks.categories.create).toHaveBeenCalledWith({
        name: 'Pottery',
        order: 0,
      });
      expect(result).toEqual({ category: CATEGORY });
    });

    it('refuses an invalid category', async () => {
      await expect(
        routes['createCategory'].handler({ name: 'X', order: 0 }, {})
      ).rejects.toThrow(/Validation failed: name/);
      expect(mocks.categories.create).not.toHaveBeenCalled();
    });

    it('refuses a name already taken', async () => {
      mocks.categories.findByName.mockResolvedValue(CATEGORY);

      await expect(
        routes['createCategory'].handler({ name: 'Pottery', order: 1 }, {})
      ).rejects.toThrow('A category with name "Pottery" already exists');
    });

    it('updates a category, validating the merged result', async () => {
      mocks.categories.findById.mockResolvedValue(CATEGORY);
      mocks.categories.update.mockResolvedValue({ ...CATEGORY, order: 3 });

      await routes['updateCategory'].handler({ id: 'cat-1', order: 3 }, {});

      expect(mocks.categories.update).toHaveBeenCalledWith({
        id: 'cat-1',
        order: 3,
      });
      expect(mocks.categories.findByName).not.toHaveBeenCalled();
    });

    it('refuses renaming onto a name already taken', async () => {
      mocks.categories.findById.mockResolvedValue(CATEGORY);
      mocks.categories.findByName.mockResolvedValue({ id: 'cat-2' });

      await expect(
        routes['updateCategory'].handler({ id: 'cat-1', name: 'Weaving' }, {})
      ).rejects.toThrow('A category with name "Weaving" already exists');
      expect(mocks.categories.update).not.toHaveBeenCalled();
    });

    it('reports a missing category on update', async () => {
      mocks.categories.findById.mockResolvedValue(undefined);

      await expect(
        routes['updateCategory'].handler({ id: 'nope' }, {})
      ).rejects.toThrow('Category nope not found');
    });

    it('reorders when the list names every category once', async () => {
      mocks.categories.findAll.mockResolvedValue([
        CATEGORY,
        { ...CATEGORY, id: 'cat-2' },
      ]);
      mocks.categories.reorderAll.mockResolvedValue([]);

      await routes['reorderCategories'].handler(
        { categoryIds: ['cat-2', 'cat-1'] },
        {}
      );

      expect(mocks.categories.reorderAll).toHaveBeenCalledWith([
        'cat-2',
        'cat-1',
      ]);
    });

    it.each([
      [[], 'categoryIds must be a non-empty array'],
      [['cat-1', 'ghost'], 'Invalid category IDs: ghost'],
      [['cat-1', 'cat-1'], 'Duplicate category IDs in request'],
    ])('refuses the order %j', async (categoryIds, message) => {
      mocks.categories.findAll.mockResolvedValue([CATEGORY]);

      await expect(
        routes['reorderCategories'].handler({ categoryIds }, {})
      ).rejects.toThrow(message);
      expect(mocks.categories.reorderAll).not.toHaveBeenCalled();
    });

    it('refuses to delete a category products still use', async () => {
      mocks.categories.findById.mockResolvedValue(CATEGORY);
      mocks.categories.countProductsWithCategory.mockResolvedValue(2);

      await expect(
        routes['deleteCategory'].handler({ id: 'cat-1' }, {})
      ).rejects.toThrow(/2 product\(s\) are using it/);
      expect(mocks.categories.delete).not.toHaveBeenCalled();
    });

    it('deletes an unused category', async () => {
      mocks.categories.findById.mockResolvedValue(CATEGORY);
      mocks.categories.countProductsWithCategory.mockResolvedValue(0);

      await expect(
        routes['deleteCategory'].handler({ id: 'cat-1' }, {})
      ).resolves.toEqual({ success: true });
      expect(mocks.categories.delete).toHaveBeenCalledWith('cat-1');
    });
  });
});
