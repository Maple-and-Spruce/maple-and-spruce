import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product } from '@maple/ts/domain';
import type { FunctionContext } from '@maple/firebase/functions';
import type { SquareSecrets, SquareStrings } from '@maple/firebase/square';

/**
 * updateProduct: the Square-owned fields go to Square first, then the
 * Firestore cache.
 *
 * The case that matters is a record whose cached `squareCatalogVersion` has
 * fallen behind Square's. Square moves an item's version without us writing to
 * it, and on dev that is the state of a product by its first edit, so every
 * name or description edit used to fail with "Catalog version mismatch".
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  updateSquareCache: vi.fn(),
  updateVariants: vi.fn(),
  updateCachedQuantity: vi.fn(),
  updateItem: vi.fn(),
  setQuantity: vi.fn(),
  setQuantities: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  ProductRepository: {
    findById: mocks.findById,
    update: mocks.update,
    updateSquareCache: mocks.updateSquareCache,
    updateVariants: mocks.updateVariants,
    updateCachedQuantity: mocks.updateCachedQuantity,
  },
}));

vi.mock('@maple/firebase/square', () => ({
  Square: class {
    catalogService = { updateItem: mocks.updateItem };
    inventoryService = {
      setQuantity: mocks.setQuantity,
      setQuantities: mocks.setQuantities,
    };
    locationId = 'loc-default';
  },
}));

vi.mock('@maple/firebase/functions', () => ({
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
  throwValidationError: (errors: Record<string, string[]>) => {
    throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
  },
}));

import { updateProduct } from './update-product';

const context = {} as FunctionContext;
const secrets = {} as SquareSecrets;
const strings = {} as SquareStrings;

function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    artistId: 'artist-1',
    status: 'active',
    squareItemId: 'SQ-ITEM-1',
    squareVariationId: 'SQ-VAR-1',
    squareCatalogVersion: 100,
    squareLocationId: 'loc-1',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    variants: [
      {
        id: 'var-1',
        label: 'Regular',
        sku: 'prd_test0001',
        priceCents: 4500,
        quantity: 3,
        squareVariationId: 'SQ-VAR-1',
      },
    ],
    squareCache: {
      name: 'Glazed Mug',
      description: 'A mug.',
      syncedAt: new Date('2026-10-01T00:00:00Z'),
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockImplementation(async (data: { id: string }) =>
    makeProduct({ id: data.id }),
  );
  mocks.updateItem.mockResolvedValue({ squareCatalogVersion: 205 });
});

describe('updateProduct: name and description', () => {
  it('renames without handing Square the cached version, then catches the record up', async () => {
    mocks.findById.mockResolvedValue(makeProduct({ squareCatalogVersion: 100 }));

    await updateProduct({ id: 'prod-1', name: 'Speckled Mug' }, context, secrets, strings);

    expect(mocks.updateItem).toHaveBeenCalledTimes(1);
    const sent = mocks.updateItem.mock.calls[0][0];
    expect(sent).toEqual({
      squareItemId: 'SQ-ITEM-1',
      name: 'Speckled Mug',
      description: undefined,
      variations: undefined,
    });
    expect(sent).not.toHaveProperty('squareCatalogVersion');

    // The version Square just wrote replaces the stale one on the record.
    expect(mocks.updateSquareCache).toHaveBeenCalledWith(
      'prod-1',
      { name: 'Speckled Mug', description: 'A mug.' },
      205,
    );
  });

  it('updates a product that has no cached version at all', async () => {
    mocks.findById.mockResolvedValue(
      makeProduct({ squareCatalogVersion: undefined }),
    );

    await updateProduct(
      { id: 'prod-1', description: 'A bigger mug.' },
      context,
      secrets,
      strings,
    );

    expect(mocks.updateItem).toHaveBeenCalledTimes(1);
    expect(mocks.updateSquareCache).toHaveBeenCalledWith(
      'prod-1',
      { name: 'Glazed Mug', description: 'A bigger mug.' },
      205,
    );
  });

  it('still refuses a product with no Square item to write to', async () => {
    mocks.findById.mockResolvedValue(
      makeProduct({ squareItemId: '' as unknown as string }),
    );

    await expect(
      updateProduct({ id: 'prod-1', name: 'Speckled Mug' }, context, secrets, strings),
    ).rejects.toThrow(/missing Square IDs/);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it('leaves the cache alone when Square refuses the write', async () => {
    mocks.findById.mockResolvedValue(makeProduct());
    mocks.updateItem.mockRejectedValue(new Error('Square API error: VERSION_MISMATCH'));

    await expect(
      updateProduct({ id: 'prod-1', name: 'Speckled Mug' }, context, secrets, strings),
    ).rejects.toThrow(/VERSION_MISMATCH/);
    expect(mocks.updateSquareCache).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('updateProduct: other paths', () => {
  it('a quantity-only edit never touches the catalog', async () => {
    mocks.findById.mockResolvedValue(makeProduct());

    await updateProduct({ id: 'prod-1', quantity: 7 }, context, secrets, strings);

    expect(mocks.updateItem).not.toHaveBeenCalled();
    expect(mocks.setQuantity).toHaveBeenCalledWith({
      squareVariationId: 'SQ-VAR-1',
      locationId: 'loc-1',
      quantity: 7,
    });
    expect(mocks.updateCachedQuantity).toHaveBeenCalledWith('prod-1', 7);
  });

  it('a Firestore-only edit never calls Square', async () => {
    mocks.findById.mockResolvedValue(makeProduct());

    await updateProduct({ id: 'prod-1', status: 'draft' }, context, secrets, strings);

    expect(mocks.updateItem).not.toHaveBeenCalled();
    expect(mocks.setQuantity).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'prod-1', status: 'draft' }),
    );
  });

  it('throws not-found for an unknown product', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(
      updateProduct({ id: 'missing', name: 'X' }, context, secrets, strings),
    ).rejects.toThrow(/Product not found: missing/);
  });
});
