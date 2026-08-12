/**
 * Integration tests for the Meta Conversions API `Purchase` triggers.
 *
 * Covers BOTH revenue lines:
 *   - `sendRegistrationConversion`  — `registrations/{id}` (craft classes)
 *   - `sendMusicTogetherConversion` — `musicTogetherRegistrations/{id}` (MT)
 *
 * Both are Firestore `onDocumentWritten` triggers in the maple-core codebase,
 * so we drive them by writing documents into the Firestore emulator and assert
 * on what lands at the Meta CAPI mock server (`META_CAPI_BASE_URL` is pointed
 * at it by tools/run-integration-tests.sh — we never talk to real Meta).
 *
 * What this locks in:
 *   - a confirmed, paid registration produces exactly one `Purchase`
 *   - `value` is DOLLARS (not cents) and `currency` is `USD`
 *   - PII is SHA-256 hashed, `_fbp`/`_fbc` pass through raw
 *   - `event_id` matches what the browser Pixel sends, so Meta dedups
 *   - an MT installment reports installment 1, not full tuition
 *   - a CAPI outage does NOT roll back or corrupt the registration
 */
import { createHash } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  EMULATOR_CONFIG,
  clearFirestoreEmulator,
  getFirestoreDoc,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';

const META_MOCK_URL = EMULATOR_CONFIG.metaCapiMockServerUrl;
// Must match what tools/run-integration-tests.sh writes to dist/apps/functions/.env
const META_PIXEL_ID = 'test-pixel-id';
// Music Together advertises from its own Meta ad account, so its conversions
// must land in its own pixel — never the Maple & Spruce one. Deliberately a
// different value from META_PIXEL_ID so the routing assertion has teeth.
const META_PIXEL_ID_MUSIC_TOGETHER = 'test-mt-pixel-id';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

interface CapiEvent {
  event_name: string;
  event_id?: string;
  event_source_url?: string;
  action_source?: string;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}

interface RecordedRequest {
  path: string;
  query: Record<string, string>;
  pixelId?: string;
  body?: { data?: CapiEvent[] };
}

async function resetMock(): Promise<void> {
  await fetch(`${META_MOCK_URL}/_mock/reset`, { method: 'POST' });
}

async function setMockFailure(status: number | null): Promise<void> {
  await fetch(`${META_MOCK_URL}/_mock/failure-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

async function recordedRequests(): Promise<RecordedRequest[]> {
  const res = await fetch(`${META_MOCK_URL}/_mock/requests`);
  const json = (await res.json()) as { requests: RecordedRequest[] };
  return json.requests.filter((r) => r.path.endsWith('/events'));
}

/**
 * Poll for `Purchase` events whose `content_ids` include `contentId`.
 *
 * Filtering by content id is essential, not cosmetic: sibling specs in this
 * suite (send-class-reminders, update-registration) also create confirmed
 * registrations, which fire the same trigger into the same shared mock server.
 * Every test below therefore uses its own unique class / section id.
 *
 * Firestore triggers are asynchronous, so a bare read right after the write
 * races the emulator's dispatch — hence the poll.
 */
async function waitForPurchases(
  contentId: string,
  count = 1,
  timeoutMs = 15_000
): Promise<CapiEvent[]> {
  const deadline = Date.now() + timeoutMs;
  let events: CapiEvent[] = [];
  do {
    const requests = await recordedRequests();
    events = requests
      .flatMap((r) => r.body?.data ?? [])
      .filter(
        (e) =>
          e.event_name === 'Purchase' &&
          Array.isArray(e.custom_data?.['content_ids']) &&
          (e.custom_data?.['content_ids'] as unknown[]).includes(contentId)
      );
    if (events.length >= count) return events;
    await new Promise((resolve) => setTimeout(resolve, 400));
  } while (Date.now() < deadline);
  return events;
}

/** The recorded requests that carried a Purchase for `contentId`. */
async function purchaseRequestsFor(
  contentId: string
): Promise<RecordedRequest[]> {
  const requests = await recordedRequests();
  return requests.filter((r) =>
    (r.body?.data ?? []).some(
      (e) =>
        e.event_name === 'Purchase' &&
        Array.isArray(e.custom_data?.['content_ids']) &&
        (e.custom_data?.['content_ids'] as unknown[]).includes(contentId)
    )
  );
}

/** Give the trigger time to (not) fire, for negative assertions. */
async function settle(ms = 4000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const now = new Date().toISOString();

function classRegistration(overrides: Record<string, unknown> = {}) {
  return {
    classId: 'conv-class-1',
    customerEmail: 'Buyer@Example.COM',
    customerName: 'Jane Doe',
    customerPhone: '304-555-0199',
    quantity: 2,
    pricePaidCents: 9540,
    subtotalCents: 9000,
    taxAmountCents: 540,
    taxRatePercent: 6,
    status: 'pending',
    source: 'web',
    confirmationNumber: 'MS-CONV01',
    fbp: 'fb.1.1700000000000.1111',
    fbc: 'fb.1.1700000000000.IwARclick',
    eventSourceUrl: 'https://example.com/classes/pottery',
    clientIp: '203.0.113.7',
    clientUserAgent: 'Mozilla/5.0 (iPhone)',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mtRegistration(overrides: Record<string, unknown> = {}) {
  return {
    sectionId: 'conv-mt-section-1',
    email: 'Family@Example.COM',
    phone: '(304) 555-0288',
    adultFirstName: 'Sam',
    adultLastName: 'Rivera',
    parentNames: ['Sam Rivera'],
    children: [{ name: 'Kid', dob: now }],
    address: '1 Main St',
    paymentPlan: 'full',
    // Real MT pricing: $252 pay-in-full for one child.
    pricePaidCents: 25200,
    totalCommittedCents: 25200,
    scheduledChargeCount: 0,
    status: 'pending',
    fbp: 'fb.1.1700000000000.2222',
    fbc: 'fb.1.1700000000000.IwARmtclick',
    eventSourceUrl: 'https://example.com/music-together/fall',
    clientIp: '203.0.113.8',
    clientUserAgent: 'Mozilla/5.0 (Android)',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Meta CAPI Purchase triggers', () => {
  beforeAll(async () => {
    await clearFirestoreEmulator();
  });

  beforeEach(async () => {
    await resetMock();
    await setMockFailure(null);
  });

  describe('sendRegistrationConversion (craft classes)', () => {
    it('sends one Purchase with dollar value, USD, and hashed PII on confirmation', async () => {
      const id = `conv-reg-${Date.now()}`;
      const classId = `conv-class-happy-${Date.now()}`;
      const doc = classRegistration({ classId });
      await setFirestoreDoc('registrations', id, doc);
      await setFirestoreDoc('registrations', id, {
        ...doc,
        status: 'confirmed',
        squarePaymentId: 'sqpay-1',
      });

      const events = await waitForPurchases(classId);
      expect(events).toHaveLength(1);
      const event = events[0];

      // Dollars, NOT cents. 9540 cents must never be reported as 9540.
      expect(event.custom_data).toMatchObject({
        value: 95.4,
        currency: 'USD',
        content_ids: [classId],
        content_type: 'product',
        num_items: 2,
      });
      expect(event.action_source).toBe('website');
      expect(event.event_source_url).toBe(
        'https://example.com/classes/pottery'
      );

      // Email/phone/name hashed (lowercased + trimmed); cookies + browser
      // context raw. No raw PII may leave the server.
      expect(event.user_data['em']).toEqual([sha256('buyer@example.com')]);
      expect(event.user_data['ph']).toEqual([sha256('13045550199')]);
      expect(event.user_data['fn']).toEqual([sha256('jane')]);
      expect(event.user_data['ln']).toEqual([sha256('doe')]);
      expect(event.user_data['fbp']).toBe('fb.1.1700000000000.1111');
      expect(event.user_data['fbc']).toBe('fb.1.1700000000000.IwARclick');
      expect(event.user_data['client_ip_address']).toBe('203.0.113.7');
      expect(event.user_data['client_user_agent']).toBe('Mozilla/5.0 (iPhone)');
      expect(JSON.stringify(event.user_data)).not.toContain('Buyer@Example');
    });

    it('uses the confirmation number as event_id so the browser Pixel dedups', async () => {
      const id = `conv-reg-dedup-${Date.now()}`;
      const classId = `conv-class-dedup-${Date.now()}`;
      const doc = classRegistration({
        classId,
        confirmationNumber: 'MS-DEDUP9',
      });
      await setFirestoreDoc('registrations', id, doc);
      await setFirestoreDoc('registrations', id, {
        ...doc,
        status: 'confirmed',
      });

      const [event] = await waitForPurchases(classId);
      // `buildPurchasePixelEvent` (apps/webflow-components/src/lib/
      // class-analytics.ts) sends this exact value as the Pixel's `eventID`.
      expect(event.event_id).toBe('MS-DEDUP9');
    });

    it('posts to the configured pixel with the access token in the query', async () => {
      const id = `conv-reg-url-${Date.now()}`;
      const classId = `conv-class-url-${Date.now()}`;
      const doc = classRegistration({ classId });
      await setFirestoreDoc('registrations', id, doc);
      await setFirestoreDoc('registrations', id, {
        ...doc,
        status: 'confirmed',
      });
      await waitForPurchases(classId);

      const [request] = await purchaseRequestsFor(classId);
      expect(request.pixelId).toBe(META_PIXEL_ID);
      expect(request.query['access_token']).toBe('test-meta-token');
    });

    it('does not re-fire when an already-confirmed registration is edited', async () => {
      const id = `conv-reg-once-${Date.now()}`;
      const classId = `conv-class-once-${Date.now()}`;
      const doc = classRegistration({ classId });
      await setFirestoreDoc('registrations', id, doc);
      await setFirestoreDoc('registrations', id, {
        ...doc,
        status: 'confirmed',
      });
      expect(await waitForPurchases(classId)).toHaveLength(1);

      await setFirestoreDoc('registrations', id, {
        ...doc,
        status: 'confirmed',
        reminderSentAt: new Date().toISOString(),
      });
      await settle();

      expect(await waitForPurchases(classId, 2, 1000)).toHaveLength(1);
    });

    it('skips in-person POS sales (not ad-driven) and $0 registrations', async () => {
      const stamp = Date.now();
      const posClassId = `conv-class-pos-${stamp}`;
      const freeClassId = `conv-class-free-${stamp}`;
      await setFirestoreDoc(
        'registrations',
        `conv-reg-pos-${stamp}`,
        classRegistration({
          classId: posClassId,
          status: 'confirmed',
          source: 'pos',
        })
      );
      await setFirestoreDoc(
        'registrations',
        `conv-reg-free-${stamp}`,
        classRegistration({
          classId: freeClassId,
          status: 'confirmed',
          pricePaidCents: 0,
        })
      );
      await settle();

      expect(await waitForPurchases(posClassId, 1, 1000)).toHaveLength(0);
      expect(await waitForPurchases(freeClassId, 1, 1000)).toHaveLength(0);
    });

    // The critical guarantee: this is real money. Meta being down must not
    // touch the registration.
    it('leaves the registration confirmed when Meta returns 500', async () => {
      await setMockFailure(500);
      const id = `conv-reg-fail-${Date.now()}`;
      const classId = `conv-class-fail-${Date.now()}`;
      const doc = classRegistration({ classId });
      await setFirestoreDoc('registrations', id, doc);
      await setFirestoreDoc('registrations', id, {
        ...doc,
        status: 'confirmed',
        squarePaymentId: 'sqpay-fail',
      });

      // The mock still records the attempt even while returning 500.
      const deadline = Date.now() + 15_000;
      let attempts: RecordedRequest[] = [];
      while (Date.now() < deadline && attempts.length === 0) {
        attempts = await purchaseRequestsFor(classId);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      expect(attempts.length).toBeGreaterThan(0);

      await settle();
      const persisted = await getFirestoreDoc('registrations', id);
      expect(persisted).toMatchObject({
        status: 'confirmed',
        squarePaymentId: 'sqpay-fail',
        confirmationNumber: 'MS-CONV01',
      });
    });
  });

  describe('sendMusicTogetherConversion (Music Together)', () => {
    it('sends a Purchase for a confirmed pay-in-full MT registration', async () => {
      const id = `conv-mt-${Date.now()}`;
      const sectionId = `conv-mt-section-full-${Date.now()}`;
      const doc = mtRegistration({ sectionId });
      await setFirestoreDoc('musicTogetherRegistrations', id, doc);
      await setFirestoreDoc('musicTogetherRegistrations', id, {
        ...doc,
        status: 'confirmed',
        squarePaymentId: 'mtpay-1',
      });

      const events = await waitForPurchases(sectionId);
      expect(events).toHaveLength(1);
      const event = events[0];

      expect(event.custom_data).toMatchObject({
        value: 252,
        currency: 'USD',
        content_ids: [sectionId],
        content_category: 'music_together',
        // One registration is one family enrollment regardless of child count.
        num_items: 1,
        payment_plan: 'full',
        // Pay-in-full: committed total and cash collected are the same.
        amount_paid_today: 252,
      });
      expect(event.event_id).toBe(`mt-${id}`);
      expect(event.user_data['em']).toEqual([sha256('family@example.com')]);
      expect(event.user_data['ph']).toEqual([sha256('13045550288')]);
      expect(event.user_data['fbc']).toBe('fb.1.1700000000000.IwARmtclick');
      expect(event.user_data['client_ip_address']).toBe('203.0.113.8');
    });

    /**
     * Music Together runs on its own Meta ad account (`act_1309930134551145`)
     * with its own pixel. Routing MT purchases into the Maple & Spruce pixel
     * would train the craft-class campaigns on MT enrollments and make the
     * separate ad account pointless — so the destination is asserted, not just
     * the payload.
     */
    it('posts MT purchases to the Music Together pixel, not the Maple & Spruce one', async () => {
      const id = `conv-mt-pixel-${Date.now()}`;
      const sectionId = `conv-mt-section-pixel-${Date.now()}`;
      const doc = mtRegistration({ sectionId });
      await setFirestoreDoc('musicTogetherRegistrations', id, doc);
      await setFirestoreDoc('musicTogetherRegistrations', id, {
        ...doc,
        status: 'confirmed',
        squarePaymentId: 'mtpay-pixel',
      });
      await waitForPurchases(sectionId);

      const [request] = await purchaseRequestsFor(sectionId);
      expect(request.pixelId).toBe(META_PIXEL_ID_MUSIC_TOGETHER);
      expect(request.pixelId).not.toBe(META_PIXEL_ID);
      // One system-user token covers both pixels.
      expect(request.query['access_token']).toBe('test-meta-token');
    });

    /**
     * The `value` decision: report the family's FULL COMMITTED tuition, not the
     * cash collected today. Installment 2 is charged around Week 5, outside
     * Meta's 7-day click window, so it could never be attributed on its own —
     * reporting installment 1 only would permanently halve this cohort's
     * apparent value versus pay-in-full families committing the same total.
     */
    it('reports the FULL committed plan total for a 1-child installment family', async () => {
      const id = `conv-mt-inst-${Date.now()}`;
      const sectionId = `conv-mt-section-inst-${Date.now()}`;
      const doc = mtRegistration({
        sectionId,
        paymentPlan: 'installments',
        pricePaidCents: 13200,
        totalCommittedCents: 26400,
        scheduledChargeCount: 1,
      });
      await setFirestoreDoc('musicTogetherRegistrations', id, doc);
      await setFirestoreDoc('musicTogetherRegistrations', id, {
        ...doc,
        status: 'confirmed',
      });

      const [event] = await waitForPurchases(sectionId);
      expect(event.custom_data).toMatchObject({
        // 2 x $132 committed — note this EXCEEDS the $252 pay-in-full price,
        // because the installment plan carries a premium.
        value: 264,
        payment_plan: 'installments',
        scheduled_charge_count: 1,
        // Cash timing still legible in Events Manager.
        amount_paid_today: 132,
      });
    });

    // Sibling pricing has to survive into the reported value: 2 children on a
    // plan is 2 x $198 = $396 — neither a flat price nor 2x the 1-child total.
    it('reports the sibling-discounted total for a multi-child installment family', async () => {
      const id = `conv-mt-multi-${Date.now()}`;
      const sectionId = `conv-mt-section-multi-${Date.now()}`;
      const doc = mtRegistration({
        sectionId,
        children: [
          { name: 'Sky', dob: now },
          { name: 'River', dob: now },
        ],
        paymentPlan: 'installments',
        pricePaidCents: 19800,
        totalCommittedCents: 39600,
        scheduledChargeCount: 1,
      });
      await setFirestoreDoc('musicTogetherRegistrations', id, doc);
      await setFirestoreDoc('musicTogetherRegistrations', id, {
        ...doc,
        status: 'confirmed',
      });

      const [event] = await waitForPurchases(sectionId);
      expect(event.custom_data).toMatchObject({
        value: 396,
        amount_paid_today: 198,
        // Still ONE family enrollment, not one per child.
        num_items: 1,
      });
      // Not 2x the 1-child committed total ($528) — the 2nd child is 50% off.
      expect(event.custom_data?.['value']).not.toBe(528);
    });

    // Registrations reserved before `totalCommittedCents` shipped still convert.
    it('falls back to the charged amount when the committed total is absent', async () => {
      const id = `conv-mt-legacy-${Date.now()}`;
      const sectionId = `conv-mt-section-legacy-${Date.now()}`;
      const doc = mtRegistration({
        sectionId,
        paymentPlan: 'installments',
        pricePaidCents: 13200,
        scheduledChargeCount: 1,
      });
      delete (doc as Record<string, unknown>)['totalCommittedCents'];
      await setFirestoreDoc('musicTogetherRegistrations', id, doc);
      await setFirestoreDoc('musicTogetherRegistrations', id, {
        ...doc,
        status: 'confirmed',
      });

      const [event] = await waitForPurchases(sectionId);
      expect(event.custom_data).toMatchObject({ value: 132 });
    });

    it('does not fire for pending, cancelled, or $0 MT registrations', async () => {
      const base = Date.now();
      const pendingSection = `conv-mt-section-pending-${base}`;
      const cancelledSection = `conv-mt-section-cancelled-${base}`;
      const freeSection = `conv-mt-section-free-${base}`;
      await setFirestoreDoc(
        'musicTogetherRegistrations',
        `conv-mt-pending-${base}`,
        mtRegistration({ sectionId: pendingSection })
      );
      await setFirestoreDoc(
        'musicTogetherRegistrations',
        `conv-mt-cancelled-${base}`,
        mtRegistration({ sectionId: cancelledSection, status: 'cancelled' })
      );
      await setFirestoreDoc(
        'musicTogetherRegistrations',
        `conv-mt-free-${base}`,
        mtRegistration({
          sectionId: freeSection,
          status: 'confirmed',
          pricePaidCents: 0,
        })
      );
      await settle();

      for (const sectionId of [pendingSection, cancelledSection, freeSection]) {
        expect(await waitForPurchases(sectionId, 1, 1000)).toHaveLength(0);
      }
    });

    it('leaves the MT registration confirmed when Meta returns 500', async () => {
      await setMockFailure(500);
      const id = `conv-mt-fail-${Date.now()}`;
      const doc = mtRegistration({
        sectionId: `conv-mt-section-fail-${Date.now()}`,
      });
      await setFirestoreDoc('musicTogetherRegistrations', id, doc);
      await setFirestoreDoc('musicTogetherRegistrations', id, {
        ...doc,
        status: 'confirmed',
        squarePaymentId: 'mtpay-fail',
      });

      await settle(6000);
      const persisted = await getFirestoreDoc('musicTogetherRegistrations', id);
      expect(persisted).toMatchObject({
        status: 'confirmed',
        squarePaymentId: 'mtpay-fail',
      });
    });
  });
});
