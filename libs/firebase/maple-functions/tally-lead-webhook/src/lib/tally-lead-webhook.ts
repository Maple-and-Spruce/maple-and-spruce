/**
 * Tally newsletter-signup webhook → GA4 Measurement Protocol + Meta Conversions API.
 *
 * Tally's free tier supports webhooks but charges for native GA4 / Meta Pixel
 * integrations. This function replicates both server-side: it verifies the
 * Tally signature, pulls the attribution context out of the submission's
 * hidden fields, and fires `generate_lead` (GA4) and `Lead` (Meta CAPI) in
 * parallel.
 *
 * Why server-side:
 * - The Tally → MailerLite flow never fires `generate_lead` in the browser,
 *   so GA4 attributes zero lead key-events to any source/medium.
 * - Meta only sees browser-side Pixel events, which iOS attribution drops.
 *
 * We always answer 200 once we've validated the payload. Downstream failures
 * are logged but never block the ack — one channel succeeding still beats
 * zero.
 *
 * TWO LISTS, TWO PIXELS
 * ---------------------
 * The site runs two signup forms: Maple & Spruce updates and Music Together
 * updates. They report to different Meta datasets, so the Meta half is routed
 * by Tally form id (see `resolveFormAttribution`) and the GA4 half carries
 * `form_name` / `form_id` to keep the single GA4 property separable.
 *
 * The browser fires the same pair from tools/webflow-tally-form-events.html,
 * so both halves stamp `eventId` = `tally-<submissionId>` and Meta counts each
 * signup once (see `leadEventId`).
 *
 * THE 10-SECOND BUDGET
 * --------------------
 * Tally hangs up at 10s and records the submission as failed. It does NOT
 * retry — a missed delivery is a permanently lost lead that has to be resent
 * by hand from Tally's events log. Everything on this path is sized against
 * that ceiling:
 *
 * - This function lives in the deliberately tiny `maple-webhooks` codebase
 *   (apps/functions-webhooks), NOT maple-core. Boot time is set by the whole
 *   codebase bundle, and maple-core measured 14.4s cold vs ~1s warm. Signups
 *   arrive in small clusters a day or more apart, so the first delivery after
 *   each idle gap paid full boot cost: of the 23 submissions between
 *   2026-07-30 and 2026-08-06, all 5 failures followed a 7.7-23h gap and every
 *   delivery within ~6h of a previous one succeeded.
 * - Both beacons are bounded (see GA4_TIMEOUT_MS / META_TIMEOUT_MS); `fetch`
 *   has no default timeout, so an unbounded hang would blow the budget even
 *   from a warm instance.
 *
 * @see https://tally.so/help/webhooks
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createHmac, timingSafeEqual } from 'crypto';
import { sendMetaCapiEvents } from '@maple/firebase/meta-capi';
import {
  tallyLeadValidation,
  type TallyLeadValidationInput,
} from '@maple/ts/validation';

// Secrets are set per-project via `firebase functions:secrets:set` and
// are required to be present for the function to deploy successfully.
// String params (below) MUST also have matching entries in .env.dev /
// .env.prod — Firebase prompts via stdin for any unset param during
// deploy-time function discovery, even when there's a default in code.
const tallyWebhookSecret = defineSecret('TALLY_WEBHOOK_SECRET');
const ga4ApiSecret = defineSecret('GA4_API_SECRET');
const metaCapiToken = defineSecret('META_CAPI_TOKEN');

const ga4MeasurementId = defineString('GA4_MEASUREMENT_ID', {
  default: 'G-TY0E9X31V6',
});
const metaPixelId = defineString('META_PIXEL_ID', {
  default: '1625932185289127',
});
const metaPixelIdMusicTogether = defineString('META_PIXEL_ID_MUSIC_TOGETHER', {
  default: '1562555242035326',
});
const ga4BaseUrl = defineString('GA4_BASE_URL', {
  default: 'https://www.google-analytics.com',
});
const metaCapiBaseUrl = defineString('META_CAPI_BASE_URL', {
  default: 'https://graph.facebook.com',
});
const metaCapiApiVersion = defineString('META_CAPI_API_VERSION', {
  default: 'v20.0',
});

/**
 * Which subscriber list a Tally form feeds, and which Meta dataset owns it.
 *
 * Music Together advertises from its own ad account against its own pixel, so
 * an MT lead sent to the Maple & Spruce pixel is worse than no lead at all —
 * it pollutes one dataset and starves the other. See
 * docs/guides/music-together-ad-tracking.md.
 *
 * Keep in sync with `FORMS` in tools/webflow-tally-form-events.html. That
 * snippet is the browser half of this exact event; the two are deduplicated
 * against each other by `eventId` (see `leadEventId`), which only works if
 * they agree on which pixel the event belongs to.
 */
export type TallyLeadAudience = 'maple-spruce' | 'music-together';

export interface TallyFormAttribution {
  /** Lead list name, reported as GA4 `form_name` / Meta `content_name`. */
  formName: string;
  audience: TallyLeadAudience;
}

// A Map, not an object literal: the key comes straight off the request body,
// and a plain-object lookup for "constructor" / "toString" would return an
// Object.prototype member instead of falling through to the default.
const TALLY_FORM_ATTRIBUTION = new Map<string, TallyFormAttribution>([
  ['0QPRq9', { formName: 'email-signup', audience: 'maple-spruce' }],
  [
    'q4Qj8d',
    { formName: 'music-together-updates', audience: 'music-together' },
  ],
]);

/**
 * Unrecognized forms report as a Maple & Spruce lead rather than being
 * dropped. A new one-off form wired to this webhook should still show up
 * somewhere; the cost of the wrong label is far lower than a silent zero.
 */
export const DEFAULT_FORM_ATTRIBUTION: TallyFormAttribution = {
  formName: 'email-signup',
  audience: 'maple-spruce',
};

export function resolveFormAttribution(formId?: string): TallyFormAttribution {
  if (!formId) return DEFAULT_FORM_ATTRIBUTION;
  return TALLY_FORM_ATTRIBUTION.get(formId) ?? DEFAULT_FORM_ATTRIBUTION;
}

/**
 * Deduplication key shared with the browser Pixel.
 *
 * Both halves fire for every submission — the footer snippet on
 * `Tally.FormSubmitted`, this function on the webhook — so without a shared id
 * Meta counts each signup twice and the MT ad account optimizes against
 * inflated lead volume.
 *
 * Tally puts the same submission id in both places: `payload.id` on the
 * browser postMessage and `data.submissionId` on the webhook body (verified
 * against a live submission — both read `Nqbzlrl`). Returns undefined when
 * Tally omits it, in which case Meta falls back to counting the event on its
 * own; better a possible double-count than a dropped conversion.
 */
export function leadEventId(submissionId?: string): string | undefined {
  return submissionId ? `tally-${submissionId}` : undefined;
}

interface TallyField {
  key?: string;
  label?: string;
  type?: string;
  value?: unknown;
}

interface TallyWebhookPayload {
  eventId?: string;
  eventType?: string;
  data?: {
    submissionId?: string;
    formId?: string;
    fields?: TallyField[];
  };
}

/**
 * Tally signs each webhook with HMAC-SHA256 (base64) of the raw body using
 * the secret configured in the Tally form's webhook settings. Constant-time
 * compare so a timing side-channel can't be used to guess the signature.
 */
function verifySignature(
  rawBody: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number') return String(value);
  return undefined;
}

function findFieldValue(
  fields: TallyField[],
  label: string
): string | undefined {
  for (const f of fields) {
    if (f.label === label) {
      const v = stringValue(f.value);
      if (v) return v;
    }
  }
  return undefined;
}

function findEmail(fields: TallyField[]): string | undefined {
  // Prefer the typed email field — robust to label tweaks in the Tally form.
  for (const f of fields) {
    if (f.type === 'INPUT_EMAIL') {
      const v = stringValue(f.value);
      if (v) return v;
    }
  }
  return findFieldValue(fields, 'Email');
}

export function extractLead(
  payload: TallyWebhookPayload
): TallyLeadValidationInput {
  const fields = payload.data?.fields ?? [];
  return {
    email: findEmail(fields),
    gaClientId: findFieldValue(fields, '_ga_client_id'),
    fbp: findFieldValue(fields, '_fbp'),
    fbc: findFieldValue(fields, '_fbc'),
    utmSource: findFieldValue(fields, 'utm_source'),
    utmMedium: findFieldValue(fields, 'utm_medium'),
    utmCampaign: findFieldValue(fields, 'utm_campaign'),
    utmContent: findFieldValue(fields, 'utm_content'),
    utmTerm: findFieldValue(fields, 'utm_term'),
    referrer: findFieldValue(fields, 'referrer'),
    landingPage: findFieldValue(fields, 'landing_page'),
  };
}

/**
 * Per-beacon ceiling. GA4 and Meta fire in parallel, so the pair costs at most
 * this much of Tally's 10s delivery budget — leaving room for cold start.
 */
const GA4_TIMEOUT_MS = 4_000;
const META_TIMEOUT_MS = 4_000;

async function sendGa4Event(
  lead: TallyLeadValidationInput,
  config: {
    baseUrl: string;
    measurementId: string;
    apiSecret: string;
    formId?: string;
    formName: string;
  }
): Promise<void> {
  const url = `${config.baseUrl}/mp/collect?measurement_id=${encodeURIComponent(
    config.measurementId
  )}&api_secret=${encodeURIComponent(config.apiSecret)}`;

  // GA4 requires a client_id. When the page-side snippet captured the `_ga`
  // cookie, sessions stitch together; otherwise we fall back to a synthetic
  // server id so the event still lands.
  const clientId =
    lead.gaClientId ||
    `server.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;

  // GA4 is one property for the whole business, so the list has to travel on
  // the event itself — same names the browser snippet pushes to the dataLayer.
  const params: Record<string, string> = { form_name: config.formName };
  if (config.formId) params['form_id'] = config.formId;
  if (lead.utmSource) params['source'] = lead.utmSource;
  if (lead.utmMedium) params['medium'] = lead.utmMedium;
  if (lead.utmCampaign) params['campaign'] = lead.utmCampaign;
  if (lead.utmContent) params['content'] = lead.utmContent;
  if (lead.utmTerm) params['term'] = lead.utmTerm;
  if (lead.referrer) params['page_referrer'] = lead.referrer;
  if (lead.landingPage) params['page_location'] = lead.landingPage;

  const body = {
    client_id: clientId,
    events: [{ name: 'generate_lead', params }],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // `fetch` has no default timeout. Both beacons are awaited before we ack,
    // so a hung connection here would eat the 10s Tally allows us and lose the
    // submission outright. Bail early instead and let the ack through.
    signal: AbortSignal.timeout(GA4_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GA4 ${response.status}: ${text}`);
  }
}

/**
 * Map the Tally lead into the shared Meta CAPI `Lead` shape.
 *
 * Hashing, payload assembly, and error semantics live in
 * `@maple/firebase/meta-capi` — shared with the registration `Purchase`
 * events so both channels normalize PII identically.
 */
function sendLeadToMeta(
  lead: TallyLeadValidationInput,
  ctx: { ip?: string; userAgent?: string },
  config: {
    baseUrl: string;
    apiVersion: string;
    pixelId: string;
    accessToken: string;
    formName: string;
    eventId?: string;
  }
): Promise<void> {
  const { formName, eventId, ...capiConfig } = config;

  const customData: Record<string, string> = {
    content_name: formName,
    content_category: 'newsletter',
  };
  if (lead.utmSource) customData['utm_source'] = lead.utmSource;
  if (lead.utmMedium) customData['utm_medium'] = lead.utmMedium;
  if (lead.utmCampaign) customData['utm_campaign'] = lead.utmCampaign;
  if (lead.utmContent) customData['utm_content'] = lead.utmContent;
  if (lead.utmTerm) customData['utm_term'] = lead.utmTerm;

  if (!lead.email) {
    throw new Error('Cannot send Meta CAPI Lead without an email');
  }

  return sendMetaCapiEvents({ ...capiConfig, timeoutMs: META_TIMEOUT_MS }, [
    {
      eventName: 'Lead',
      eventId,
      actionSource: 'website',
      eventSourceUrl: lead.landingPage,
      user: {
        email: lead.email,
        // Known unconditionally — this is a Morgantown, WV local business and
        // every one of these forms is a US form. Meta indexes `country` as its
        // own hashed match key, so sending it costs nothing and lifts match
        // quality on every event.
        country: 'us',
        // Lowercased email as our cross-surface person id. Hashed before send.
        // Using the SAME value on every surface is what lets Meta resolve one
        // family's demo RSVP, interest signup, and enrollment to one person.
        externalId: lead.email?.trim().toLowerCase() || undefined,
        fbp: lead.fbp,
        fbc: lead.fbc,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      customData,
    },
  ]);
}

export const tallyLeadWebhook = onRequest(
  {
    region: 'us-east4',
    memory: '256MiB',
    concurrency: 80,
    secrets: [tallyWebhookSecret, ga4ApiSecret, metaCapiToken],
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }

    // Firebase Functions v2 exposes the raw bytes as `rawBody`. We have to
    // verify the signature against those exact bytes — re-stringifying
    // `request.body` would change key order / whitespace and break HMAC.
    const rawBuffer = (request as unknown as { rawBody?: Buffer }).rawBody;
    const rawBody = rawBuffer
      ? rawBuffer.toString('utf8')
      : typeof request.body === 'string'
      ? request.body
      : JSON.stringify(request.body ?? {});

    const signature =
      (request.headers['tally-signature'] as string | undefined) ??
      (request.headers['x-tally-signature'] as string | undefined);

    if (!verifySignature(rawBody, signature, tallyWebhookSecret.value())) {
      console.warn('Tally webhook signature verification failed');
      response.status(401).send('Invalid signature');
      return;
    }

    let payload: TallyWebhookPayload;
    try {
      payload =
        typeof request.body === 'object' && request.body !== null
          ? (request.body as TallyWebhookPayload)
          : (JSON.parse(rawBody) as TallyWebhookPayload);
    } catch (err) {
      console.warn('Tally webhook payload could not be parsed', err);
      response.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }

    const lead = extractLead(payload);
    const validation = tallyLeadValidation(lead);
    if (validation.hasErrors()) {
      const errors = validation.getErrors();
      console.warn('Tally webhook lead validation failed', errors);
      response.status(400).json({ error: 'Invalid lead payload', errors });
      return;
    }

    const ctx = {
      ip: typeof request.ip === 'string' ? request.ip : undefined,
      userAgent: request.headers['user-agent'] as string | undefined,
    };

    const formId = payload.data?.formId;
    const attribution = resolveFormAttribution(formId);
    const pixelId =
      attribution.audience === 'music-together'
        ? metaPixelIdMusicTogether.value()
        : metaPixelId.value();

    const [ga4Result, metaResult] = await Promise.allSettled([
      sendGa4Event(lead, {
        baseUrl: ga4BaseUrl.value(),
        measurementId: ga4MeasurementId.value(),
        apiSecret: ga4ApiSecret.value(),
        formId,
        formName: attribution.formName,
      }),
      sendLeadToMeta(lead, ctx, {
        baseUrl: metaCapiBaseUrl.value(),
        apiVersion: metaCapiApiVersion.value(),
        pixelId,
        accessToken: metaCapiToken.value(),
        formName: attribution.formName,
        eventId: leadEventId(payload.data?.submissionId),
      }),
    ]);

    if (ga4Result.status === 'rejected') {
      console.error('GA4 Measurement Protocol call failed', ga4Result.reason);
    }
    if (metaResult.status === 'rejected') {
      console.error('Meta CAPI call failed', metaResult.reason);
    }

    response.status(200).json({
      received: true,
      ga4: ga4Result.status,
      meta: metaResult.status,
      submissionId: payload.data?.submissionId,
    });
  }
);
