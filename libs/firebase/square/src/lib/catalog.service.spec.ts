import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogService } from './catalog.service';
import type { SquareClient } from 'square';

/**
 * Unit tests for the Square CatalogService wrapper.
 *
 * Mocks the Square client at the method level and verifies
 * catalog CRUD orchestration with single and multiple variations.
 */

interface MockClient {
  catalog: {
    batchUpsert: ReturnType<typeof vi.fn>;
    object: {
      get: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    list: ReturnType<typeof vi.fn>;
    images: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}

function makeMockClient(): MockClient {
  return {
    catalog: {
      batchUpsert: vi.fn(),
      object: {
        get: vi.fn(),
        delete: vi.fn(),
      },
      list: vi.fn(),
      images: {
        create: vi.fn(),
      },
    },
  };
}

describe('CatalogService.createItem', () => {
  let client: MockClient;
  let service: CatalogService;

  beforeEach(() => {
    client = makeMockClient();
    service = new CatalogService(client as unknown as SquareClient);
  });

  it('creates a single "Regular" variation when no variants provided', async () => {
    client.catalog.batchUpsert.mockResolvedValue({
      objects: [
        {
          type: 'ITEM',
          id: 'SQ-ITEM-1',
          version: 1n,
          itemData: {
            variations: [
              {
                type: 'ITEM_VARIATION',
                id: 'SQ-VAR-1',
                itemVariationData: { sku: 'prd_abc123' },
              },
            ],
          },
        },
      ],
    });

    const result = await service.createItem({
      name: 'Handmade Mug',
      description: 'A lovely mug',
      priceCents: 2500,
      sku: 'prd_abc123',
    });

    // Verify a single variation was sent to Square
    const batchCall = client.catalog.batchUpsert.mock.calls[0][0];
    const sentVariations =
      batchCall.batches[0].objects[0].itemData.variations;
    expect(sentVariations).toHaveLength(1);
    expect(sentVariations[0].itemVariationData.name).toBe('Regular');
    expect(sentVariations[0].itemVariationData.priceMoney.amount).toBe(
      2500n
    );

    // Verify result
    expect(result.squareItemId).toBe('SQ-ITEM-1');
    expect(result.squareCatalogVersion).toBe(1);
    expect(result.variations).toHaveLength(1);
    expect(result.variations[0].squareVariationId).toBe('SQ-VAR-1');
    expect(result.variations[0].sku).toBe('prd_abc123');

    // Legacy fields
    expect(result.squareVariationId).toBe('SQ-VAR-1');
    expect(result.sku).toBe('prd_abc123');
  });

  it('creates multiple ITEM_VARIATIONs when variants array is provided', async () => {
    client.catalog.batchUpsert.mockResolvedValue({
      objects: [
        {
          type: 'ITEM',
          id: 'SQ-ITEM-2',
          version: 3n,
          itemData: {
            variations: [
              {
                type: 'ITEM_VARIATION',
                id: 'SQ-VAR-SM',
                itemVariationData: { sku: 'prd_sm' },
              },
              {
                type: 'ITEM_VARIATION',
                id: 'SQ-VAR-LG',
                itemVariationData: { sku: 'prd_lg' },
              },
            ],
          },
        },
      ],
    });

    const result = await service.createItem({
      name: 'Ceramic Bowl',
      description: 'Available in two sizes',
      variants: [
        { label: 'Small', priceCents: 2000, sku: 'prd_sm', variantId: 'var_sm' },
        { label: 'Large', priceCents: 3500, sku: 'prd_lg', variantId: 'var_lg' },
      ],
    });

    // Verify two variations sent to Square
    const batchCall = client.catalog.batchUpsert.mock.calls[0][0];
    const sentVariations =
      batchCall.batches[0].objects[0].itemData.variations;
    expect(sentVariations).toHaveLength(2);
    expect(sentVariations[0].itemVariationData.name).toBe('Small');
    expect(sentVariations[0].itemVariationData.priceMoney.amount).toBe(
      2000n
    );
    expect(sentVariations[1].itemVariationData.name).toBe('Large');
    expect(sentVariations[1].itemVariationData.priceMoney.amount).toBe(
      3500n
    );

    // Verify result maps back correctly
    expect(result.squareItemId).toBe('SQ-ITEM-2');
    expect(result.squareCatalogVersion).toBe(3);
    expect(result.variations).toHaveLength(2);

    expect(result.variations[0]).toEqual({
      variantId: 'var_sm',
      squareVariationId: 'SQ-VAR-SM',
      sku: 'prd_sm',
    });
    expect(result.variations[1]).toEqual({
      variantId: 'var_lg',
      squareVariationId: 'SQ-VAR-LG',
      sku: 'prd_lg',
    });

    // Legacy fields point at first variation
    expect(result.squareVariationId).toBe('SQ-VAR-SM');
    expect(result.sku).toBe('prd_sm');
  });

  it('throws when Square returns errors', async () => {
    client.catalog.batchUpsert.mockResolvedValue({
      errors: [{ code: 'INVALID_REQUEST', detail: 'bad data' }],
    });

    await expect(
      service.createItem({ name: 'Fail', priceCents: 100 })
    ).rejects.toThrow(/Square API error.*bad data/);
  });

  it('throws when no ITEM object in response', async () => {
    client.catalog.batchUpsert.mockResolvedValue({ objects: [] });

    await expect(
      service.createItem({ name: 'Missing', priceCents: 100 })
    ).rejects.toThrow(/no ITEM in response/);
  });

  it('throws when no variations in response', async () => {
    client.catalog.batchUpsert.mockResolvedValue({
      objects: [
        {
          type: 'ITEM',
          id: 'SQ-ITEM-3',
          version: 1,
          itemData: { variations: [] },
        },
      ],
    });

    await expect(
      service.createItem({ name: 'NoVar', priceCents: 100 })
    ).rejects.toThrow(/no variations in ITEM response/);
  });

  it('generates SKU when not provided', async () => {
    client.catalog.batchUpsert.mockResolvedValue({
      objects: [
        {
          type: 'ITEM',
          id: 'SQ-ITEM-4',
          version: 1n,
          itemData: {
            variations: [
              {
                type: 'ITEM_VARIATION',
                id: 'SQ-VAR-4',
                itemVariationData: { sku: 'prd_generated' },
              },
            ],
          },
        },
      ],
    });

    // The generated SKU won't match the response sku, but the result
    // should still use the input sku we generated (not the response one)
    const result = await service.createItem({
      name: 'Auto SKU',
      priceCents: 500,
    });

    // Should have a SKU starting with 'prd_'
    expect(result.sku).toMatch(/^prd_/);
    expect(result.variations).toHaveLength(1);
  });
});

describe('CatalogService.updateItem', () => {
  let client: MockClient;
  let service: CatalogService;

  beforeEach(() => {
    client = makeMockClient();
    service = new CatalogService(client as unknown as SquareClient);
  });

  function mockCurrentItem(variations: Array<{ id: string; sku: string; price: number }>) {
    const nestedVariations = variations.map((v) => ({
      type: 'ITEM_VARIATION',
      id: v.id,
      version: 1n,
      itemVariationData: {
        sku: v.sku,
        priceMoney: { amount: BigInt(v.price), currency: 'USD' },
      },
    }));

    client.catalog.object.get.mockResolvedValue({
      object: {
        type: 'ITEM',
        id: 'SQ-ITEM-1',
        version: 5n,
        itemData: {
          name: 'Original Name',
          description: 'Original Description',
          variations: nestedVariations,
        },
      },
      relatedObjects: [],
    });

    client.catalog.batchUpsert.mockResolvedValue({
      objects: [
        {
          type: 'ITEM',
          id: 'SQ-ITEM-1',
          version: 6n,
        },
      ],
    });
  }

  it('updates a single variation via legacy fields', async () => {
    mockCurrentItem([{ id: 'SQ-VAR-1', sku: 'prd_abc', price: 2500 }]);

    const result = await service.updateItem({
      squareItemId: 'SQ-ITEM-1',
      squareCatalogVersion: 5,
      squareVariationId: 'SQ-VAR-1',
      priceCents: 3000,
    });

    expect(result.squareCatalogVersion).toBe(6);

    const batchCall = client.catalog.batchUpsert.mock.calls[0][0];
    const sentVariations =
      batchCall.batches[0].objects[0].itemData.variations;
    expect(sentVariations).toHaveLength(1);
    expect(sentVariations[0].itemVariationData.priceMoney.amount).toBe(
      3000n
    );
  });

  it('updates multiple variations via variations array', async () => {
    mockCurrentItem([
      { id: 'SQ-VAR-SM', sku: 'prd_sm', price: 2000 },
      { id: 'SQ-VAR-LG', sku: 'prd_lg', price: 3500 },
    ]);

    const result = await service.updateItem({
      squareItemId: 'SQ-ITEM-1',
      squareCatalogVersion: 5,
      name: 'Updated Bowl',
      variations: [
        { squareVariationId: 'SQ-VAR-SM', priceCents: 2200 },
        { squareVariationId: 'SQ-VAR-LG', priceCents: 3800 },
      ],
    });

    expect(result.squareCatalogVersion).toBe(6);

    const batchCall = client.catalog.batchUpsert.mock.calls[0][0];
    const itemData = batchCall.batches[0].objects[0].itemData;
    expect(itemData.name).toBe('Updated Bowl');
    expect(itemData.variations).toHaveLength(2);
    expect(
      itemData.variations[0].itemVariationData.priceMoney.amount
    ).toBe(2200n);
    expect(
      itemData.variations[1].itemVariationData.priceMoney.amount
    ).toBe(3800n);
  });

  it('updates item-level fields only (no variation changes)', async () => {
    mockCurrentItem([{ id: 'SQ-VAR-1', sku: 'prd_abc', price: 2500 }]);

    const result = await service.updateItem({
      squareItemId: 'SQ-ITEM-1',
      squareCatalogVersion: 5,
      name: 'New Name',
      description: 'New Desc',
    });

    expect(result.squareCatalogVersion).toBe(6);

    const batchCall = client.catalog.batchUpsert.mock.calls[0][0];
    const itemData = batchCall.batches[0].objects[0].itemData;
    expect(itemData.name).toBe('New Name');
    expect(itemData.description).toBe('New Desc');
    // No variation updates when none specified
    expect(itemData.variations).toHaveLength(0);
  });

  it('throws on version mismatch', async () => {
    client.catalog.object.get.mockResolvedValue({
      object: {
        type: 'ITEM',
        id: 'SQ-ITEM-1',
        version: 10n,
        itemData: { variations: [] },
      },
    });

    await expect(
      service.updateItem({
        squareItemId: 'SQ-ITEM-1',
        squareCatalogVersion: 5,
        name: 'Conflict',
      })
    ).rejects.toThrow(/version mismatch/);
  });

  it('throws when variation not found', async () => {
    mockCurrentItem([{ id: 'SQ-VAR-1', sku: 'prd_abc', price: 2500 }]);

    await expect(
      service.updateItem({
        squareItemId: 'SQ-ITEM-1',
        squareCatalogVersion: 5,
        variations: [
          { squareVariationId: 'SQ-VAR-MISSING', priceCents: 999 },
        ],
      })
    ).rejects.toThrow(/variation not found.*SQ-VAR-MISSING/);
  });

  it('finds variation in relatedObjects when not nested', async () => {
    client.catalog.object.get.mockResolvedValue({
      object: {
        type: 'ITEM',
        id: 'SQ-ITEM-1',
        version: 5n,
        itemData: {
          name: 'Bowl',
          variations: [],
        },
      },
      relatedObjects: [
        {
          type: 'ITEM_VARIATION',
          id: 'SQ-VAR-REL',
          version: 1n,
          itemVariationData: {
            sku: 'prd_rel',
            priceMoney: { amount: 1000n, currency: 'USD' },
          },
        },
      ],
    });

    client.catalog.batchUpsert.mockResolvedValue({
      objects: [{ type: 'ITEM', id: 'SQ-ITEM-1', version: 6n }],
    });

    const result = await service.updateItem({
      squareItemId: 'SQ-ITEM-1',
      squareCatalogVersion: 5,
      squareVariationId: 'SQ-VAR-REL',
      priceCents: 1200,
    });

    expect(result.squareCatalogVersion).toBe(6);
  });
});
