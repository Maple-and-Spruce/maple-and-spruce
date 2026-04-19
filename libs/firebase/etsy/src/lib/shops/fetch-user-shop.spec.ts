import { describe, it, expect, vi } from 'vitest';
import { fetchUserShopId, parseShopId } from './fetch-user-shop';

describe('parseShopId', () => {
  it('returns shop_id when body has it at the top level', () => {
    expect(parseShopId({ shop_id: 12345 })).toBe('12345');
  });

  it('returns first shop_id when body is paginated', () => {
    expect(
      parseShopId({ count: 1, results: [{ shop_id: 42 }, { shop_id: 99 }] })
    ).toBe('42');
  });

  it('prefers top-level shop_id when both are present', () => {
    expect(
      parseShopId({ shop_id: 1, results: [{ shop_id: 2 }] })
    ).toBe('1');
  });

  it('returns null for empty results array', () => {
    expect(parseShopId({ count: 0, results: [] })).toBeNull();
  });

  it('returns null for missing shop_id', () => {
    expect(parseShopId({})).toBeNull();
    expect(parseShopId(null)).toBeNull();
    expect(parseShopId('not an object')).toBeNull();
  });
});

describe('fetchUserShopId', () => {
  function makeFetch(responses: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    json?: unknown;
    text?: string;
    throws?: Error;
  }): typeof fetch {
    return vi.fn(async () => {
      if (responses.throws) throw responses.throws;
      return {
        ok: responses.ok ?? true,
        status: responses.status ?? 200,
        statusText: responses.statusText ?? 'OK',
        json: async () => responses.json,
        text: async () => responses.text ?? '',
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  const base = {
    apiBase: 'https://api.etsy.com/v3/application',
    apiKey: 'k',
    sharedSecret: 's',
    userId: '12345',
    accessToken: 't',
  };

  it('returns shopId on 200 with top-level shop_id shape', async () => {
    const result = await fetchUserShopId({
      ...base,
      fetchImpl: makeFetch({ json: { shop_id: 999 } }),
    });
    expect(result.shopId).toBe('999');
    expect(result.status).toBe(200);
  });

  it('returns shopId on 200 with paginated shape', async () => {
    const result = await fetchUserShopId({
      ...base,
      fetchImpl: makeFetch({ json: { results: [{ shop_id: 777 }] } }),
    });
    expect(result.shopId).toBe('777');
  });

  it('returns null with a reason on 200 with unrecognized shape', async () => {
    const result = await fetchUserShopId({
      ...base,
      fetchImpl: makeFetch({ json: { unexpected: 'shape' } }),
    });
    expect(result.shopId).toBeNull();
    expect(result.reason).toContain('Unrecognized response shape');
  });

  it('returns null with a reason on 403', async () => {
    const result = await fetchUserShopId({
      ...base,
      fetchImpl: makeFetch({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: 'missing scope shops_r',
      }),
    });
    expect(result.shopId).toBeNull();
    expect(result.status).toBe(403);
    expect(result.reason).toContain('missing scope');
  });

  it('returns null when fetch throws', async () => {
    const result = await fetchUserShopId({
      ...base,
      fetchImpl: makeFetch({ throws: new Error('connection refused') }),
    });
    expect(result.shopId).toBeNull();
    expect(result.status).toBeNull();
    expect(result.reason).toBe('connection refused');
  });

  it('sends the expected headers and URL', async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ shop_id: 1 }),
      text: async () => '',
    })) as unknown as typeof fetch;

    await fetchUserShopId({ ...base, fetchImpl: spy });

    expect(spy).toHaveBeenCalledWith(
      'https://api.etsy.com/v3/application/users/12345/shops',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'k:s',
          Authorization: 'Bearer t',
        }),
      })
    );
  });
});
