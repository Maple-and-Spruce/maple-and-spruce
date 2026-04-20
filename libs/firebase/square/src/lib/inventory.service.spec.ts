import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from './inventory.service';
import type { SquareClient } from 'square';

/**
 * Unit tests for the Square InventoryService wrapper.
 *
 * Mocks the Square client at the method level and verifies
 * inventory set/adjust operations including batch setQuantities.
 */

interface MockClient {
  inventory: {
    batchCreateChanges: ReturnType<typeof vi.fn>;
    batchGetCounts: ReturnType<typeof vi.fn>;
  };
  locations: {
    list: ReturnType<typeof vi.fn>;
  };
}

function makeMockClient(): MockClient {
  return {
    inventory: {
      batchCreateChanges: vi.fn().mockResolvedValue({}),
      batchGetCounts: vi.fn().mockResolvedValue({ data: [] }),
    },
    locations: {
      list: vi.fn(),
    },
  };
}

describe('InventoryService.setQuantities', () => {
  let client: MockClient;
  let service: InventoryService;

  beforeEach(() => {
    client = makeMockClient();
    service = new InventoryService(client as unknown as SquareClient);
  });

  it('sends a single batchCreateChanges call with all entries', async () => {
    await service.setQuantities([
      { squareVariationId: 'SQ-VAR-SM', locationId: 'LOC-1', quantity: 5 },
      { squareVariationId: 'SQ-VAR-LG', locationId: 'LOC-1', quantity: 3 },
    ]);

    expect(client.inventory.batchCreateChanges).toHaveBeenCalledTimes(1);
    const call = client.inventory.batchCreateChanges.mock.calls[0][0];
    expect(call.changes).toHaveLength(2);

    expect(call.changes[0].type).toBe('PHYSICAL_COUNT');
    expect(call.changes[0].physicalCount.catalogObjectId).toBe('SQ-VAR-SM');
    expect(call.changes[0].physicalCount.quantity).toBe('5');
    expect(call.changes[0].physicalCount.state).toBe('IN_STOCK');

    expect(call.changes[1].physicalCount.catalogObjectId).toBe('SQ-VAR-LG');
    expect(call.changes[1].physicalCount.quantity).toBe('3');
  });

  it('is a no-op when entries array is empty', async () => {
    await service.setQuantities([]);
    expect(client.inventory.batchCreateChanges).not.toHaveBeenCalled();
  });

  it('handles a single entry', async () => {
    await service.setQuantities([
      { squareVariationId: 'SQ-VAR-1', locationId: 'LOC-1', quantity: 10 },
    ]);

    expect(client.inventory.batchCreateChanges).toHaveBeenCalledTimes(1);
    const call = client.inventory.batchCreateChanges.mock.calls[0][0];
    expect(call.changes).toHaveLength(1);
    expect(call.changes[0].physicalCount.quantity).toBe('10');
  });
});

describe('InventoryService.setQuantity', () => {
  let client: MockClient;
  let service: InventoryService;

  beforeEach(() => {
    client = makeMockClient();
    service = new InventoryService(client as unknown as SquareClient);
  });

  it('sends a PHYSICAL_COUNT change', async () => {
    await service.setQuantity({
      squareVariationId: 'SQ-VAR-1',
      locationId: 'LOC-1',
      quantity: 7,
    });

    expect(client.inventory.batchCreateChanges).toHaveBeenCalledTimes(1);
    const call = client.inventory.batchCreateChanges.mock.calls[0][0];
    expect(call.changes).toHaveLength(1);
    expect(call.changes[0].type).toBe('PHYSICAL_COUNT');
    expect(call.changes[0].physicalCount.catalogObjectId).toBe('SQ-VAR-1');
    expect(call.changes[0].physicalCount.quantity).toBe('7');
  });
});
