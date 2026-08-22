import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import {
  buildCapiEvent,
  buildUserData,
  hashLocationToken,
  hashNormalized,
  hashPhone,
  hashZip,
  sendMetaCapiEvents,
  splitName,
  trySendMetaCapiEvents,
  type MetaCapiConfig,
} from './meta-capi';

const sha256 = (v: string) =>
  createHash('sha256').update(v).digest('hex');

describe('PII hashing', () => {
  it('hashNormalized trims + lowercases before SHA-256', () => {
    expect(hashNormalized('  Jane@Example.COM ')).toBe(
      sha256('jane@example.com')
    );
  });

  it('hashPhone strips non-digits before SHA-256', () => {
    expect(hashPhone('+1 (304) 555-0199')).toBe(sha256('13045550199'));
  });

  // Meta's index is keyed on country-code-prefixed digits. A bare 10-digit
  // NANP number without the leading 1 hashes to a value that matches nobody,
  // so a US number typed without +1 must normalize to the same hash as one
  // typed with it.
  it('hashPhone prefixes the US country code onto a bare 10-digit number', () => {
    expect(hashPhone('304-555-0199')).toBe(sha256('13045550199'));
    expect(hashPhone('(304) 555 0199')).toBe(hashPhone('+1 304 555 0199'));
  });

  it('hashPhone leaves an already-prefixed or non-NANP number alone', () => {
    expect(hashPhone('+44 20 7946 0958')).toBe(sha256('442079460958'));
  });
});

describe('splitName', () => {
  it('splits first token off as the first name', () => {
    expect(splitName('Jane Doe')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('keeps multi-part surnames intact', () => {
    expect(splitName('  Ana Maria de la Cruz ')).toEqual({
      firstName: 'Ana',
      lastName: 'Maria de la Cruz',
    });
  });

  it('returns only a first name for a single token, and {} for empty', () => {
    expect(splitName('Prince')).toEqual({ firstName: 'Prince' });
    expect(splitName('   ')).toEqual({});
    expect(splitName(undefined)).toEqual({});
  });
});

describe('buildUserData', () => {
  it('hashes email, phone, and name; passes cookies/ip/ua through raw', () => {
    const data = buildUserData({
      email: 'Jane@Example.com',
      phone: '304-555-0199',
      firstName: 'Jane',
      lastName: 'Doe',
      fbp: 'fb.1.123.456',
      fbc: 'fb.1.123.click',
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0',
    });

    expect(data).toEqual({
      em: [sha256('jane@example.com')],
      ph: [sha256('13045550199')],
      fn: [sha256('jane')],
      ln: [sha256('doe')],
      fbp: 'fb.1.123.456',
      fbc: 'fb.1.123.click',
      client_ip_address: '203.0.113.5',
      client_user_agent: 'Mozilla/5.0',
    });
  });

  it('omits fields that are absent (no empty hashes)', () => {
    const data = buildUserData({ email: 'a@b.com' });
    expect(Object.keys(data)).toEqual(['em']);
  });
});

describe('buildCapiEvent', () => {
  it('emits event_id, action_source, custom_data, and default time', () => {
    const payload = buildCapiEvent(
      {
        eventName: 'Purchase',
        eventId: 'MS-ABC123',
        eventSourceUrl: 'https://example.com/classes/x',
        user: { email: 'a@b.com' },
        customData: { currency: 'USD', value: 80 },
      },
      1_700_000_000
    );

    expect(payload).toMatchObject({
      event_name: 'Purchase',
      event_time: 1_700_000_000,
      action_source: 'website',
      event_id: 'MS-ABC123',
      event_source_url: 'https://example.com/classes/x',
      custom_data: { currency: 'USD', value: 80 },
      user_data: { em: [sha256('a@b.com')] },
    });
  });

  it('honors an explicit eventTimeSeconds over now', () => {
    const payload = buildCapiEvent(
      { eventName: 'Lead', user: {}, eventTimeSeconds: 42 },
      999
    );
    expect(payload.event_time).toBe(42);
  });
});

describe('sendMetaCapiEvents', () => {
  const config: MetaCapiConfig = {
    baseUrl: 'https://graph.example.com',
    apiVersion: 'v20.0',
    pixelId: '999',
    accessToken: 'tok en/&',
  };

  afterEach(() => vi.restoreAllMocks());

  it('POSTs to the versioned pixel events URL with an encoded token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ events_received: 1 }), { status: 200 })
      );

    await sendMetaCapiEvents(
      config,
      [{ eventName: 'Purchase', user: { email: 'a@b.com' } }],
      1_700_000_000
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://graph.example.com/v20.0/999/events?access_token=tok%20en%2F%26'
    );
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.data[0]).toMatchObject({
      event_name: 'Purchase',
      event_time: 1_700_000_000,
    });
  });

  it('throws when Meta responds non-2xx (so the caller can log)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad token', { status: 400 })
    );

    await expect(
      sendMetaCapiEvents(config, [{ eventName: 'Purchase', user: {} }])
    ).rejects.toThrow(/Meta CAPI 400/);
  });

  it('is a no-op when there are no events', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await sendMetaCapiEvents(config, []);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('trySendMetaCapiEvents (best-effort)', () => {
  const config: MetaCapiConfig = {
    baseUrl: 'https://graph.example.com',
    apiVersion: 'v20.0',
    pixelId: '999',
    accessToken: 'tok',
  };
  const logger = { warn: vi.fn(), error: vi.fn() };

  afterEach(() => {
    vi.restoreAllMocks();
    logger.warn.mockReset();
    logger.error.mockReset();
  });

  it('returns true and sends when Meta accepts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 })
    );
    await expect(
      trySendMetaCapiEvents(config, [{ eventName: 'Purchase', user: {} }], logger)
    ).resolves.toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  // The whole point of this wrapper: a marketing beacon must never surface an
  // error to a caller that has already charged a customer's card.
  it('swallows and logs a non-2xx from Meta instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 500 })
    );
    await expect(
      trySendMetaCapiEvents(config, [{ eventName: 'Purchase', user: {} }], logger)
    ).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('swallows and logs a network rejection instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      trySendMetaCapiEvents(config, [{ eventName: 'Purchase', user: {} }], logger)
    ).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('skips (and warns) with no config, without calling fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      trySendMetaCapiEvents(undefined, [{ eventName: 'Purchase', user: {} }], logger)
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('skips when the access token is blank (unset secret in a local env)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      trySendMetaCapiEvents(
        { ...config, accessToken: '' },
        [{ eventName: 'Purchase', user: {} }],
        logger
      )
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('location match keys', () => {
  it('hashLocationToken strips spaces and punctuation, not just case', () => {
    // Meta normalizes `St. Louis` to `stlouis`. Hashing the raw string (or
    // merely lowercasing it, as `hashNormalized` does) produces a value their
    // index has never seen — a field that matches nobody while looking, in
    // Events Manager, like we supplied one.
    expect(hashLocationToken('St. Louis')).toBe(sha256('stlouis'));
    expect(hashLocationToken('  Morgantown ')).toBe(sha256('morgantown'));
    expect(hashLocationToken('WV')).toBe(sha256('wv'));
  });

  it('hashLocationToken returns undefined when nothing survives', () => {
    // Better to send no `ct` than a hash of the empty string.
    expect(hashLocationToken('  -- ')).toBeUndefined();
    expect(hashLocationToken('')).toBeUndefined();
  });

  it('hashZip truncates ZIP+4 to the indexed 5 digits', () => {
    expect(hashZip('26505-1234')).toBe(sha256('26505'));
    expect(hashZip('265051234')).toBe(sha256('26505'));
    expect(hashZip(' 26505 ')).toBe(sha256('26505'));
  });

  it('hashZip does not truncate a non-numeric postal code', () => {
    // Canadian / UK codes are not 5-digit-prefixed; truncating them would
    // destroy the value entirely.
    expect(hashZip('K1A 0B1')).toBe(sha256('k1a0b1'));
  });

  it('buildUserData emits ct / st / zp / country / external_id as hashed arrays', () => {
    const data = buildUserData({
      email: 'Jamie@Example.com',
      city: 'Morgantown',
      state: 'WV',
      zip: '26505-1234',
      country: 'US',
      externalId: 'jamie@example.com',
    });

    expect(data['ct']).toEqual([sha256('morgantown')]);
    expect(data['st']).toEqual([sha256('wv')]);
    expect(data['zp']).toEqual([sha256('26505')]);
    expect(data['country']).toEqual([sha256('us')]);
    expect(data['external_id']).toEqual([sha256('jamie@example.com')]);
    // Nothing in plaintext ever leaves us.
    expect(JSON.stringify(data)).not.toContain('Morgantown');
    expect(JSON.stringify(data)).not.toContain('jamie@example.com');
  });

  it('omits a location key entirely when it normalizes to nothing', () => {
    const data = buildUserData({ email: 'a@b.com', city: '   ', state: '--' });
    expect(data).not.toHaveProperty('ct');
    expect(data).not.toHaveProperty('st');
  });
});
