import { describe, it, expect, vi } from 'vitest';
import { SquareClient, SquareError } from 'square';
import { CustomersService } from './customers.service';

function makeClient(search: unknown, create: unknown): SquareClient {
  return {
    customers: {
      search: vi.fn().mockResolvedValue(search),
      create: vi.fn().mockResolvedValue(create),
    },
  } as unknown as SquareClient;
}

/** Client whose customer search rejects (real-Square email-validation path). */
function makeSearchRejectsClient(
  searchError: unknown,
  create: unknown
): SquareClient {
  return {
    customers: {
      search: vi.fn().mockRejectedValue(searchError),
      create: vi.fn().mockResolvedValue(create),
    },
  } as unknown as SquareClient;
}

function makeGetClient(get: unknown): SquareClient {
  return {
    customers: {
      get: vi.fn().mockResolvedValue(get),
    },
  } as unknown as SquareClient;
}

describe('CustomersService.get', () => {
  it('returns the mapped customer when found', async () => {
    const client = makeGetClient({
      customer: {
        id: 'cust-1',
        emailAddress: 'buyer@example.com',
        givenName: 'Grace',
        familyName: 'Hopper',
      },
    });

    const result = await new CustomersService(client).get('cust-1');

    expect(result).toEqual({
      emailAddress: 'buyer@example.com',
      givenName: 'Grace',
      familyName: 'Hopper',
    });
    expect(client.customers.get).toHaveBeenCalledWith({ customerId: 'cust-1' });
  });

  it('returns null when no customer is in the response', async () => {
    const client = makeGetClient({});
    const result = await new CustomersService(client).get('missing');
    expect(result).toBeNull();
  });

  it('maps missing optional fields to undefined', async () => {
    const client = makeGetClient({ customer: { id: 'cust-2' } });
    const result = await new CustomersService(client).get('cust-2');
    expect(result).toEqual({
      emailAddress: undefined,
      givenName: undefined,
      familyName: undefined,
    });
  });
});

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

  it('falls through to create when the customer search REJECTS the email', async () => {
    // Real Square rejects the Customers Search email filter with INVALID_VALUE
    // for some addresses (e.g. the e2e's reserved-TLD / plus-addressed emails,
    // and potentially a real family's plus-addressed Gmail). A search failure
    // must not block the vault — we create instead of throwing.
    const searchError = new SquareError({ message: 'HTTP 400' });
    Object.defineProperty(searchError, 'errors', {
      value: [
        {
          code: 'INVALID_VALUE',
          detail: 'The provided email address is invalid.',
          field: 'email',
        },
      ],
      writable: true,
    });
    const client = makeSearchRejectsClient(searchError, {
      customer: { id: 'created-after-search-failed' },
    });

    const id = await new CustomersService(client).upsertByEmail({
      email: 'mt-e2e-installments+123@maplespruce.test',
      name: 'Casey Nguyen',
    });

    expect(id).toBe('created-after-search-failed');
    expect(client.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: 'mt-e2e-installments+123@maplespruce.test',
      })
    );
  });
});

/** Invented people only (#332). */
const robin = {
  id: 'cust-robin',
  givenName: 'Robin',
  familyName: 'Ashfield',
  emailAddress: 'robin@example.com',
  phoneNumber: '+13045550142',
};

function pageOf<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

describe('CustomersService.find (#332)', () => {
  it('returns the customer with its id', async () => {
    const service = new CustomersService(makeGetClient({ customer: robin }));
    expect(await service.find('cust-robin')).toEqual(robin);
  });

  it('returns undefined when Square has no such customer', async () => {
    const client = {
      customers: {
        get: vi.fn().mockRejectedValue(new SquareError({ statusCode: 404, message: 'nope' })),
      },
    } as unknown as SquareClient;
    expect(await new CustomersService(client).find('gone')).toBeUndefined();
  });

  it('rethrows any other failure', async () => {
    const client = {
      customers: {
        get: vi.fn().mockRejectedValue(new SquareError({ statusCode: 500, message: 'down' })),
      },
    } as unknown as SquareClient;
    await expect(new CustomersService(client).find('x')).rejects.toThrow();
  });
});

describe('CustomersService.searchByContact (#332)', () => {
  it('searches email with the fuzzy filter and a limit', async () => {
    const client = makeClient({ customers: [robin, { givenName: 'no id' }] }, {});
    const found = await new CustomersService(client).searchByContact('email', 'robin@', 10);
    expect(client.customers.search).toHaveBeenCalledWith({
      limit: BigInt(10),
      query: { filter: { emailAddress: { fuzzy: 'robin@' } } },
    });
    expect(found).toEqual([robin]);
  });

  it('searches phone digits with the fuzzy filter', async () => {
    const client = makeClient({ customers: [] }, {});
    await new CustomersService(client).searchByContact('phone', '3045550142', 5);
    expect(client.customers.search).toHaveBeenCalledWith({
      limit: BigInt(5),
      query: { filter: { phoneNumber: { fuzzy: '3045550142' } } },
    });
  });

  it('throws on Square errors', async () => {
    const client = makeClient({ errors: [{ code: 'BAD', detail: 'bad filter' }] }, {});
    await expect(
      new CustomersService(client).searchByContact('email', 'x@', 5)
    ).rejects.toThrow(/bad filter/);
  });
});

describe('CustomersService.findByName (#332)', () => {
  const olive = { id: 'cust-olive', givenName: 'Olive', familyName: 'Thompson' };

  it('reads newest customers first and keeps the matches', async () => {
    const list = vi.fn().mockResolvedValue(pageOf([olive, robin]));
    const client = { customers: { list } } as unknown as SquareClient;
    const found = await new CustomersService(client).findByName(
      (name) => name.includes('Robin'),
      10,
      2000
    );
    expect(list).toHaveBeenCalledWith({ limit: 100, sortField: 'CREATED_AT', sortOrder: 'DESC' });
    expect(found.map((c) => c.id)).toEqual(['cust-robin']);
  });

  it('stops at the match limit and at the scan bound', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, givenName: 'Robin' }));
    const client = {
      customers: { list: vi.fn().mockResolvedValue(pageOf(many)) },
    } as unknown as SquareClient;
    const service = new CustomersService(client);
    expect(await service.findByName(() => true, 3, 2000)).toHaveLength(3);
    expect(await service.findByName(() => true, 100, 7)).toHaveLength(7);
  });

  it('skips a customer with no name', async () => {
    const client = {
      customers: { list: vi.fn().mockResolvedValue(pageOf([{ id: 'c', emailAddress: 'a@example.com' }])) },
    } as unknown as SquareClient;
    expect(await new CustomersService(client).findByName(() => true, 10, 10)).toEqual([]);
  });
});
