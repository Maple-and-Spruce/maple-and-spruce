import { describe, it, expect, vi } from 'vitest';
import { SquareClient } from 'square';
import { SubscriptionsService } from './subscriptions.service';

function clientWith(method: string, value: unknown): SquareClient {
  return {
    subscriptions: { [method]: vi.fn().mockResolvedValue(value) },
  } as unknown as SquareClient;
}

const createInput = {
  planVariationId: 'plan',
  customerId: 'cust',
  cardId: 'card',
  locationId: 'loc',
  idempotencyKey: 'key',
};

describe('SubscriptionsService', () => {
  it('create returns id, status, and chargedThroughDate', async () => {
    const client = clientWith('create', {
      subscription: {
        id: 'sub-1',
        status: 'ACTIVE',
        chargedThroughDate: '2026-07-26',
      },
    });
    const result = await new SubscriptionsService(client).create(createInput);
    expect(result).toEqual({
      subscriptionId: 'sub-1',
      status: 'ACTIVE',
      chargedThroughDate: '2026-07-26',
    });
  });

  it('create throws on a Square error', async () => {
    const client = clientWith('create', {
      errors: [{ code: 'X', detail: 'bad plan' }],
    });
    await expect(
      new SubscriptionsService(client).create(createInput)
    ).rejects.toThrow(/create subscription/);
  });

  it('create throws when no id is returned', async () => {
    const client = clientWith('create', { subscription: {} });
    await expect(
      new SubscriptionsService(client).create(createInput)
    ).rejects.toThrow(/returned no id/);
  });

  it('cancel returns status and canceledDate', async () => {
    const client = clientWith('cancel', {
      subscription: { status: 'CANCELED', canceledDate: '2026-08-01' },
    });
    expect(await new SubscriptionsService(client).cancel('sub-1')).toEqual({
      status: 'CANCELED',
      canceledDate: '2026-08-01',
    });
  });
});
