import { describe, it, expect, vi } from 'vitest';
import { SquareClient } from 'square';
import { CustomersService } from './customers.service';

function makeClient(search: unknown, create: unknown): SquareClient {
  return {
    customers: {
      search: vi.fn().mockResolvedValue(search),
      create: vi.fn().mockResolvedValue(create),
    },
  } as unknown as SquareClient;
}

describe('CustomersService.upsertByEmail', () => {
  it('returns an existing customer id without creating', async () => {
    const client = makeClient({ customers: [{ id: 'existing' }] }, {});
    const id = await new CustomersService(client).upsertByEmail({
      email: 'a@b.com',
    });
    expect(id).toBe('existing');
    expect(client.customers.create).not.toHaveBeenCalled();
  });

  it('creates a customer when none is found', async () => {
    const client = makeClient(
      { customers: [] },
      { customer: { id: 'new-id' } }
    );
    const id = await new CustomersService(client).upsertByEmail({
      email: 'a@b.com',
      name: 'Ada Lovelace',
    });
    expect(id).toBe('new-id');
    expect(client.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: 'a@b.com',
        givenName: 'Ada',
        familyName: 'Lovelace',
      })
    );
  });

  it('throws on a Square error', async () => {
    const client = makeClient(
      { customers: [] },
      { errors: [{ code: 'BAD_REQUEST', detail: 'nope' }] }
    );
    await expect(
      new CustomersService(client).upsertByEmail({ email: 'a@b.com' })
    ).rejects.toThrow(/create customer/);
  });
});
