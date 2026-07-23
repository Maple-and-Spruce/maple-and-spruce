import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import {
  buildCapiEvent,
  buildUserData,
  hashNormalized,
  hashPhone,
  sendMetaCapiEvents,
  type MetaCapiConfig,
} from './meta-capi.utility';

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
      ph: [sha256('3045550199')],
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
