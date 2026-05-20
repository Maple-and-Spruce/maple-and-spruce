/**
 * Integration tests for the tallyLeadWebhook Cloud Function.
 *
 * Exercises the deployed onRequest endpoint through the Functions emulator
 * with GA4 and Meta CAPI traffic redirected to the per-service mock
 * servers. Verifies:
 *   - HMAC signature gate (401 on mismatch, no downstream calls)
 *   - Vest validation gate (400 on missing email, no downstream calls)
 *   - Happy path fan-out to both endpoints with the right payload
 *   - Single-channel resilience: if either downstream fails, the other
 *     still fires and Tally still gets a 200 ack
 *   - Tally retry semantics — duplicate submissions hit both endpoints
 *     twice (we don't deduplicate on the server)
 */
import { createHmac, createHash } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { EMULATOR_CONFIG } from '@maple/firebase/integration-test-utils';

// Must match what tools/run-integration-tests.sh writes to .secret.local
const TALLY_SECRET = 'test-tally-secret';
const META_PIXEL_ID = 'test-pixel-id';

const WEBHOOK_URL = `${EMULATOR_CONFIG.functionsHost}/${EMULATOR_CONFIG.projectId}/${EMULATOR_CONFIG.region}/tallyLeadWebhook`;
const GA4_MOCK_URL = EMULATOR_CONFIG.ga4MockServerUrl;
const META_MOCK_URL = EMULATOR_CONFIG.metaCapiMockServerUrl;

interface TallyHiddenField {
  label: string;
  type: string;
  value: string;
}

function tallyPayload(overrides: {
  email?: string | null;
  hidden?: Partial<{
    gaClientId: string;
    fbp: string;
    fbc: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent: string;
    utmTerm: string;
    referrer: string;
    landingPage: string;
  }>;
} = {}): Record<string, unknown> {
  const h = overrides.hidden ?? {};
  const fields: TallyHiddenField[] = [];

  if (overrides.email !== null) {
    fields.push({
      label: 'Email',
      type: 'INPUT_EMAIL',
      value: overrides.email ?? 'lead@example.com',
    });
  }

  const hiddenMap: Array<[string, string | undefined]> = [
    ['_ga_client_id', h.gaClientId],
    ['_fbp', h.fbp],
    ['_fbc', h.fbc],
    ['utm_source', h.utmSource],
    ['utm_medium', h.utmMedium],
    ['utm_campaign', h.utmCampaign],
    ['utm_content', h.utmContent],
    ['utm_term', h.utmTerm],
    ['referrer', h.referrer],
    ['landing_page', h.landingPage],
  ];

  for (const [label, value] of hiddenMap) {
    fields.push({
      label,
      type: 'HIDDEN_FIELDS',
      value: value ?? '',
    });
  }

  return {
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    eventType: 'FORM_RESPONSE',
    createdAt: new Date().toISOString(),
    data: {
      submissionId: `sub-${Date.now()}`,
      formId: 'test-form',
      fields,
    },
  };
}

function signBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

async function postWebhook(options: {
  body: unknown;
  signature?: string;
  signWith?: string;
  userAgent?: string;
}): Promise<{ status: number; body: unknown }> {
  const raw = JSON.stringify(options.body);
  const signature =
    options.signature ??
    (options.signWith ? signBody(raw, options.signWith) : undefined);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (signature) headers['tally-signature'] = signature;
  if (options.userAgent) headers['User-Agent'] = options.userAgent;

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: raw,
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { status: response.status, body: parsed };
}

interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  pixelId?: string;
  apiVersion?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

async function resetMocks(): Promise<void> {
  await Promise.all([
    fetch(`${GA4_MOCK_URL}/_mock/reset`, { method: 'POST' }),
    fetch(`${META_MOCK_URL}/_mock/reset`, { method: 'POST' }),
  ]);
}

async function setGa4Failure(status: number | null): Promise<void> {
  await fetch(`${GA4_MOCK_URL}/_mock/failure-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

async function setMetaFailure(status: number | null): Promise<void> {
  await fetch(`${META_MOCK_URL}/_mock/failure-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

async function getGa4Requests(): Promise<RecordedRequest[]> {
  const res = await fetch(`${GA4_MOCK_URL}/_mock/requests`);
  const json = (await res.json()) as { requests: RecordedRequest[] };
  return json.requests.filter((r) => r.path.startsWith('/mp/collect'));
}

async function getMetaRequests(): Promise<RecordedRequest[]> {
  const res = await fetch(`${META_MOCK_URL}/_mock/requests`);
  const json = (await res.json()) as { requests: RecordedRequest[] };
  return json.requests.filter((r) => /^\/v\d+\.\d+\/[^/]+\/events$/.test(r.path));
}

describe('tallyLeadWebhook', () => {
  beforeAll(async () => {
    await resetMocks();
  });

  beforeEach(async () => {
    await resetMocks();
  });

  describe('Signature verification', () => {
    it('rejects requests with no signature header', async () => {
      const result = await postWebhook({
        body: tallyPayload(),
      });
      expect(result.status).toBe(401);
      expect(await getGa4Requests()).toHaveLength(0);
      expect(await getMetaRequests()).toHaveLength(0);
    });

    it('rejects requests with a wrong signature', async () => {
      const result = await postWebhook({
        body: tallyPayload(),
        signature: 'not-the-right-signature',
      });
      expect(result.status).toBe(401);
      expect(await getGa4Requests()).toHaveLength(0);
      expect(await getMetaRequests()).toHaveLength(0);
    });

    it('rejects requests signed with the wrong secret', async () => {
      const result = await postWebhook({
        body: tallyPayload(),
        signWith: 'wrong-secret',
      });
      expect(result.status).toBe(401);
      expect(await getGa4Requests()).toHaveLength(0);
      expect(await getMetaRequests()).toHaveLength(0);
    });
  });

  describe('Payload validation', () => {
    it('returns 400 and skips downstream calls when email is missing', async () => {
      const result = await postWebhook({
        body: tallyPayload({ email: null }),
        signWith: TALLY_SECRET,
      });
      expect(result.status).toBe(400);
      expect((result.body as { error?: string }).error).toBe(
        'Invalid lead payload'
      );
      expect(await getGa4Requests()).toHaveLength(0);
      expect(await getMetaRequests()).toHaveLength(0);
    });
  });

  describe('Happy path fan-out', () => {
    it('fires generate_lead to GA4 and Lead to Meta CAPI with attribution context', async () => {
      const payload = tallyPayload({
        email: 'Lead@Example.COM',
        hidden: {
          gaClientId: '1234567890.0987654321',
          fbp: 'fb.1.1700000000000.1234567890',
          fbc: 'fb.1.1700000000000.AbCdEfGhIj',
          utmSource: 'instagram',
          utmMedium: 'social',
          utmCampaign: 'spring-classes',
          referrer: 'https://www.instagram.com/',
          landingPage: 'https://mapleandsprucewv.com/classes',
        },
      });

      const result = await postWebhook({
        body: payload,
        signWith: TALLY_SECRET,
        userAgent: 'TestAgent/1.0',
      });

      expect(result.status).toBe(200);
      expect((result.body as { ga4?: string }).ga4).toBe('fulfilled');
      expect((result.body as { meta?: string }).meta).toBe('fulfilled');

      const ga4Requests = await getGa4Requests();
      expect(ga4Requests).toHaveLength(1);
      const ga4 = ga4Requests[0];
      expect(ga4.method).toBe('POST');
      expect(ga4.query['measurement_id']).toBe('G-TEST-MOCK');
      expect(ga4.query['api_secret']).toBe('test-ga4-secret');
      const ga4Body = ga4.body as {
        client_id: string;
        events: Array<{ name: string; params: Record<string, string> }>;
      };
      expect(ga4Body.client_id).toBe('1234567890.0987654321');
      expect(ga4Body.events[0].name).toBe('generate_lead');
      expect(ga4Body.events[0].params).toMatchObject({
        source: 'instagram',
        medium: 'social',
        campaign: 'spring-classes',
        page_referrer: 'https://www.instagram.com/',
        page_location: 'https://mapleandsprucewv.com/classes',
      });

      const metaRequests = await getMetaRequests();
      expect(metaRequests).toHaveLength(1);
      const meta = metaRequests[0];
      expect(meta.apiVersion).toBe('v20.0');
      expect(meta.pixelId).toBe(META_PIXEL_ID);
      expect(meta.query['access_token']).toBe('test-meta-token');
      const metaBody = meta.body as {
        data: Array<{
          event_name: string;
          action_source: string;
          event_source_url?: string;
          user_data: Record<string, unknown>;
          custom_data: Record<string, unknown>;
        }>;
      };
      const event = metaBody.data[0];
      expect(event.event_name).toBe('Lead');
      expect(event.action_source).toBe('website');
      expect(event.event_source_url).toBe(
        'https://mapleandsprucewv.com/classes'
      );
      // Lowercased + SHA-256 hashed email
      expect((event.user_data['em'] as string[])[0]).toBe(
        hashEmail('Lead@Example.COM')
      );
      expect(event.user_data['fbp']).toBe('fb.1.1700000000000.1234567890');
      expect(event.user_data['fbc']).toBe('fb.1.1700000000000.AbCdEfGhIj');
      expect(event.user_data['client_user_agent']).toBe('TestAgent/1.0');
      expect(event.custom_data).toMatchObject({
        utm_source: 'instagram',
        utm_medium: 'social',
        utm_campaign: 'spring-classes',
      });
    });

    it('fires both calls even without attribution cookies (minimal payload)', async () => {
      const result = await postWebhook({
        body: tallyPayload({ email: 'minimal@example.com' }),
        signWith: TALLY_SECRET,
      });
      expect(result.status).toBe(200);
      expect(await getGa4Requests()).toHaveLength(1);
      expect(await getMetaRequests()).toHaveLength(1);
    });
  });

  describe('Partial-failure resilience', () => {
    it('returns 200 with meta=fulfilled when GA4 fails', async () => {
      await setGa4Failure(500);
      try {
        const result = await postWebhook({
          body: tallyPayload(),
          signWith: TALLY_SECRET,
        });
        expect(result.status).toBe(200);
        expect((result.body as { ga4?: string }).ga4).toBe('rejected');
        expect((result.body as { meta?: string }).meta).toBe('fulfilled');
        expect(await getGa4Requests()).toHaveLength(1); // attempted
        expect(await getMetaRequests()).toHaveLength(1); // succeeded
      } finally {
        await setGa4Failure(null);
      }
    });

    it('returns 200 with ga4=fulfilled when Meta CAPI fails', async () => {
      await setMetaFailure(500);
      try {
        const result = await postWebhook({
          body: tallyPayload(),
          signWith: TALLY_SECRET,
        });
        expect(result.status).toBe(200);
        expect((result.body as { ga4?: string }).ga4).toBe('fulfilled');
        expect((result.body as { meta?: string }).meta).toBe('rejected');
        expect(await getGa4Requests()).toHaveLength(1); // succeeded
        expect(await getMetaRequests()).toHaveLength(1); // attempted
      } finally {
        await setMetaFailure(null);
      }
    });
  });

  describe('Tally retry semantics', () => {
    // Tally retries on 5xx. The function does not deduplicate by
    // submissionId, so two deliveries of the same submission fire both
    // downstream calls twice. This is documented behavior: GA4 and Meta
    // tolerate occasional duplicates, and the alternative (storing
    // dedupe state) introduces a Firestore write on the hot path.
    it('processes duplicate submissions independently', async () => {
      const payload = tallyPayload({ email: 'dupe@example.com' });
      const r1 = await postWebhook({ body: payload, signWith: TALLY_SECRET });
      const r2 = await postWebhook({ body: payload, signWith: TALLY_SECRET });
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(await getGa4Requests()).toHaveLength(2);
      expect(await getMetaRequests()).toHaveLength(2);
    });
  });
});
