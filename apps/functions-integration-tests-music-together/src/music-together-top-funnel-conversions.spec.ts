/**
 * Integration tests for the SERVER-SIDE Meta signals on the two top-of-funnel
 * Music Together conversions: a free demo RSVP (`Schedule`) and an
 * interest-list signup (`Lead`).
 *
 * Why these matter enough to have their own suite: the first MT ad campaign
 * spent $124 over nine days, drove 328 landing page views, and reported ZERO
 * pixel-attributed conversions. With browser-only tracking there was no way to
 * tell "nobody converted" from "the signal never arrived" — ad blockers and
 * Safari ITP eat an unknown share of the Pixel. These events are the backup.
 *
 * Unlike `sendMusicTogetherConversion` (a Firestore trigger), both of these are
 * sent INLINE by the callable, so there is no trigger race to poll around: by
 * the time the HTTP response lands, the CAPI POST has already been made. That
 * is asserted here too — it is the property that lets the callable return the
 * `event_id` the browser Pixel then reuses.
 *
 * `META_CAPI_BASE_URL` points at the mock Graph server (see
 * tools/run-integration-tests.sh); we never talk to real Meta.
 */
import { createHash } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  EMULATOR_CONFIG,
  clearFirestoreEmulator,
  callFunction,
  getFirestoreDoc,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import type {
  AddMusicTogetherDemoRsvpRequest,
  AddMusicTogetherDemoRsvpResponse,
  AddMusicTogetherInterestRequest,
  AddMusicTogetherInterestResponse,
} from '@maple/ts/firebase/api-types';

const META_MOCK_URL = EMULATOR_CONFIG.metaCapiMockServerUrl;
// Deliberately different from META_PIXEL_ID ('test-pixel-id') so the routing
// assertion has teeth: MT advertises from its own ad account, and an MT
// conversion landing in the Maple & Spruce dataset defeats the whole split.
const META_PIXEL_ID_MUSIC_TOGETHER = 'test-mt-pixel-id';
const META_PIXEL_ID = 'test-pixel-id';

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
 * Every recorded request carrying `eventName` with this exact `event_id`.
 *
 * Keying on the event id rather than the name is what keeps this suite from
 * reading a sibling spec's events — `music-together-demo.spec.ts` and
 * `music-together-interest.spec.ts` hit the same callables against the same
 * shared mock server, and they now emit real CAPI events too.
 */
async function requestsFor(
  eventName: string,
  eventId: string
): Promise<{ request: RecordedRequest; event: CapiEvent }[]> {
  const requests = await recordedRequests();
  const matches: { request: RecordedRequest; event: CapiEvent }[] = [];
  for (const request of requests) {
    for (const event of request.body?.data ?? []) {
      if (event.event_name === eventName && event.event_id === eventId) {
        matches.push({ request, event });
      }
    }
  }
  return matches;
}

/** Unique per test so parallel/sequential runs never read each other's events. */
let seq = 0;
function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${seq++}@example.com`;
}

async function seedDemo(
  id: string,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  await setFirestoreDoc('musicTogetherDemos', id, {
    dateTime: new Date(Date.now() + 7 * 86_400_000),
    location: 'Morgantown Public Library',
    capacityFamilies: 8,
    durationMinutes: 45,
    visible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

async function seedSection(id: string): Promise<void> {
  await setFirestoreDoc('musicTogetherSections', id, {
    name: 'Thursday 10am',
    visible: true,
    capacityFamilies: 10,
    priceFullCents: 25000,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

const ATTRIBUTION = {
  fbp: 'fb.1.1700000000000.987654321',
  fbc: 'fb.1.1700000000000.IwAR-real-click',
  eventSourceUrl: 'https://mapleandsprucefolkarts.com/music-together-demo',
};

/** Headers a real browser request arrives with, through Google's front end. */
const CLIENT_HEADERS = {
  'X-Forwarded-For': '203.0.113.55, 130.211.0.1',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
};

describe('Music Together top-of-funnel Meta signals', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await resetMock();
    await setMockFailure(null);
  });

  describe('demo RSVP → Schedule', () => {
    it('posts one Schedule to the MT pixel with the response event_id', async () => {
      const demoId = `demo-schedule-${Date.now()}`;
      const email = uniqueEmail('rsvp');
      await seedDemo(demoId);

      const response = await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Jamie Rivera', email, metaAttribution: ATTRIBUTION },
        headers: CLIENT_HEADERS,
      });

      expect(response.status).toBe(200);
      const eventId = response.data?.eventId;
      expect(eventId).toMatch(/^mt-demo-[0-9a-f]{16}$/);

      // The send is INLINE, so it has already happened by the time we get the
      // response. No polling — if this ever needs a retry loop, the send moved
      // off the request path and the `event_id` contract changed with it.
      const matches = await requestsFor('Schedule', eventId as string);
      expect(matches).toHaveLength(1);

      const { request, event } = matches[0];
      // MT's own dataset, never Maple & Spruce's.
      expect(request.pixelId).toBe(META_PIXEL_ID_MUSIC_TOGETHER);
      expect(request.pixelId).not.toBe(META_PIXEL_ID);

      expect(event.action_source).toBe('website');
      expect(event.event_source_url).toBe(ATTRIBUTION.eventSourceUrl);
      expect(event.custom_data).toMatchObject({
        content_ids: [demoId],
        content_name: 'music-together-demo',
        rsvp_status: 'confirmed',
      });
    });

    it('hashes the email and passes fbp / fbc / ip / ua through', async () => {
      const demoId = `demo-match-${Date.now()}`;
      const email = uniqueEmail('match');
      await seedDemo(demoId);

      const response = await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Jamie Rivera', email, metaAttribution: ATTRIBUTION },
        headers: CLIENT_HEADERS,
      });

      const [{ event }] = await requestsFor(
        'Schedule',
        response.data?.eventId as string
      );
      const user = event.user_data;

      // PII is SHA-256'd; nothing readable crosses the wire.
      expect(user['em']).toEqual([sha256(email.toLowerCase())]);
      expect(user['fn']).toEqual([sha256('jamie')]);
      expect(user['ln']).toEqual([sha256('rivera')]);
      expect(JSON.stringify(user)).not.toContain(email);

      // fbp / fbc are Meta's own ids and must travel RAW.
      expect(user['fbp']).toBe(ATTRIBUTION.fbp);
      expect(user['fbc']).toBe(ATTRIBUTION.fbc);

      // The left-most x-forwarded-for entry is the real client; the rest is
      // Google's front end.
      expect(user['client_ip_address']).toBe('203.0.113.55');
      expect(user['client_user_agent']).toBe(CLIENT_HEADERS['User-Agent']);

      // Known without asking, and the cross-surface person id.
      expect(user['country']).toEqual([sha256('us')]);
      expect(user['external_id']).toEqual([sha256(email.toLowerCase())]);
    });

    it('persists the attribution on the RSVP document', async () => {
      const demoId = `demo-persist-${Date.now()}`;
      const email = uniqueEmail('persist');
      await seedDemo(demoId);

      await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Jamie Rivera', email, metaAttribution: ATTRIBUTION },
        headers: CLIENT_HEADERS,
      });

      // Subcollection keyed by the lowercased email.
      const doc = await getFirestoreDoc(
        `musicTogetherDemos/${demoId}/rsvps`,
        email.toLowerCase()
      );
      expect(doc).toMatchObject({
        fbp: ATTRIBUTION.fbp,
        fbc: ATTRIBUTION.fbc,
        eventSourceUrl: ATTRIBUTION.eventSourceUrl,
        clientIp: '203.0.113.55',
        clientUserAgent: CLIENT_HEADERS['User-Agent'],
      });
    });

    it('marks a full-demo waitlist join as waitlisted, not a booked seat', async () => {
      const demoId = `demo-full-${Date.now()}`;
      await seedDemo(demoId, { capacityFamilies: 1 });

      await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'First Family', email: uniqueEmail('first') },
      });

      const second = await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Second Family', email: uniqueEmail('second') },
      });

      expect(second.data?.status).toBe('waitlisted');
      const [{ event }] = await requestsFor(
        'Schedule',
        second.data?.eventId as string
      );
      expect(event.custom_data).toMatchObject({ rsvp_status: 'waitlisted' });
    });

    it('sends nothing on a repeat RSVP, but returns the same event_id', async () => {
      // Public + unauthenticated. Sending on every call would let anyone
      // inflate a campaign's conversion count by replaying an RSVP.
      const demoId = `demo-repeat-${Date.now()}`;
      const email = uniqueEmail('repeat');
      await seedDemo(demoId);

      const first = await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Jamie Rivera', email },
      });
      const second = await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Jamie Rivera', email },
      });

      expect(second.data?.added).toBe(false);
      expect(second.data?.eventId).toBe(first.data?.eventId);
      // Still exactly one Schedule on the wire.
      expect(await requestsFor('Schedule', first.data?.eventId as string)).toHaveLength(1);
    });

    it('never puts the family email in the event_id', async () => {
      // The RSVP document id IS the lowercased email, so the obvious
      // `mt-demo-<docId>` would ship a plaintext address to Meta.
      const demoId = `demo-nopii-${Date.now()}`;
      const email = uniqueEmail('nopii');
      await seedDemo(demoId);

      const response = await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Jamie Rivera', email },
      });

      expect(response.data?.eventId).not.toContain('@');
      expect(response.data?.eventId).not.toContain('nopii');
    });

    it('still confirms the RSVP when Meta is down', async () => {
      // A marketing beacon must never be able to tell a family their RSVP
      // did not take.
      const demoId = `demo-outage-${Date.now()}`;
      const email = uniqueEmail('outage');
      await seedDemo(demoId);
      await setMockFailure(500);

      const response = await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Jamie Rivera', email, metaAttribution: ATTRIBUTION },
      });

      expect(response.status).toBe(200);
      expect(response.data?.added).toBe(true);
      expect(response.data?.status).toBe('confirmed');
      // And the seat really is reserved, not just reported.
      const doc = await getFirestoreDoc(
        `musicTogetherDemos/${demoId}/rsvps`,
        email.toLowerCase()
      );
      expect(doc).toMatchObject({ status: 'confirmed' });
    });
  });

  describe('interest signup → Lead', () => {
    it('posts one Lead to the MT pixel with the response event_id', async () => {
      const sectionId = `sec-lead-${Date.now()}`;
      const email = uniqueEmail('interest');
      await seedSection(sectionId);

      const response = await callFunction<
        AddMusicTogetherInterestRequest,
        AddMusicTogetherInterestResponse
      >({
        functionName: 'addMusicTogetherInterest',
        data: {
          name: 'Jamie Rivera',
          email,
          interestedSectionIds: [sectionId],
          metaAttribution: ATTRIBUTION,
        },
        headers: CLIENT_HEADERS,
      });

      expect(response.status).toBe(200);
      const eventId = response.data?.eventId;
      expect(eventId).toMatch(/^mt-interest-[0-9a-f]{16}$/);

      const matches = await requestsFor('Lead', eventId as string);
      expect(matches).toHaveLength(1);

      const { request, event } = matches[0];
      expect(request.pixelId).toBe(META_PIXEL_ID_MUSIC_TOGETHER);
      expect(event.custom_data).toMatchObject({
        content_ids: [sectionId],
        content_name: 'music-together-interest',
      });

      const user = event.user_data;
      expect(user['em']).toEqual([sha256(email.toLowerCase())]);
      expect(user['fbp']).toBe(ATTRIBUTION.fbp);
      expect(user['fbc']).toBe(ATTRIBUTION.fbc);
      expect(user['client_ip_address']).toBe('203.0.113.55');
      expect(user['client_user_agent']).toBe(CLIENT_HEADERS['User-Agent']);
      expect(user['country']).toEqual([sha256('us')]);
    });

    it('persists the attribution on the interest document', async () => {
      const email = uniqueEmail('interest-persist');

      await callFunction<
        AddMusicTogetherInterestRequest,
        AddMusicTogetherInterestResponse
      >({
        functionName: 'addMusicTogetherInterest',
        data: {
          name: 'Jamie Rivera',
          email,
          interestedSectionIds: [],
          alternateTimesNote: 'Weekday afternoons',
          metaAttribution: ATTRIBUTION,
        },
        headers: CLIENT_HEADERS,
      });

      const doc = await getFirestoreDoc(
        'musicTogetherInterest',
        email.toLowerCase()
      );
      expect(doc).toMatchObject({
        fbp: ATTRIBUTION.fbp,
        fbc: ATTRIBUTION.fbc,
        clientIp: '203.0.113.55',
      });
    });

    it('sends nothing on a re-submit, and keeps the original click id', async () => {
      const email = uniqueEmail('interest-repeat');

      const first = await callFunction<
        AddMusicTogetherInterestRequest,
        AddMusicTogetherInterestResponse
      >({
        functionName: 'addMusicTogetherInterest',
        data: {
          name: 'Jamie Rivera',
          email,
          interestedSectionIds: [],
          alternateTimesNote: 'Weekday afternoons',
          metaAttribution: ATTRIBUTION,
        },
      });

      // Second visit from a bookmark: no cookies at all.
      const second = await callFunction<
        AddMusicTogetherInterestRequest,
        AddMusicTogetherInterestResponse
      >({
        functionName: 'addMusicTogetherInterest',
        data: {
          name: 'Jamie Rivera',
          email,
          interestedSectionIds: [],
          alternateTimesNote: 'Weekends too',
        },
      });

      expect(second.data?.added).toBe(false);
      expect(second.data?.eventId).toBe(first.data?.eventId);
      expect(await requestsFor('Lead', first.data?.eventId as string)).toHaveLength(1);

      // The campaign link survives the rewrite.
      const doc = await getFirestoreDoc(
        'musicTogetherInterest',
        email.toLowerCase()
      );
      expect(doc).toMatchObject({ fbc: ATTRIBUTION.fbc });
    });

    it('still records the signup when Meta is down', async () => {
      const email = uniqueEmail('interest-outage');
      await setMockFailure(500);

      const response = await callFunction<
        AddMusicTogetherInterestRequest,
        AddMusicTogetherInterestResponse
      >({
        functionName: 'addMusicTogetherInterest',
        data: {
          name: 'Jamie Rivera',
          email,
          interestedSectionIds: [],
          alternateTimesNote: 'Weekday afternoons',
        },
      });

      expect(response.status).toBe(200);
      expect(response.data?.added).toBe(true);
      expect(
        await getFirestoreDoc('musicTogetherInterest', email.toLowerCase())
      ).toBeTruthy();
    });
  });

  describe('cross-surface identity', () => {
    it('gives one family the same external_id on both events', async () => {
      // This is what lets Meta stitch a demo RSVP and an interest signup (and a
      // later enrollment) into one person, which is the whole basis for a
      // lookalike audience built off our best top-of-funnel signal.
      const demoId = `demo-identity-${Date.now()}`;
      const email = uniqueEmail('identity');
      await seedDemo(demoId);

      const rsvp = await callFunction<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >({
        functionName: 'addMusicTogetherDemoRsvp',
        data: { demoId, name: 'Jamie Rivera', email },
      });
      const interest = await callFunction<
        AddMusicTogetherInterestRequest,
        AddMusicTogetherInterestResponse
      >({
        functionName: 'addMusicTogetherInterest',
        data: {
          name: 'Jamie Rivera',
          email,
          interestedSectionIds: [],
          alternateTimesNote: 'Any morning',
        },
      });

      const [schedule] = await requestsFor(
        'Schedule',
        rsvp.data?.eventId as string
      );
      const [lead] = await requestsFor('Lead', interest.data?.eventId as string);

      expect(schedule.event.user_data['external_id']).toEqual(
        lead.event.user_data['external_id']
      );
      // But the two conversions stay distinct events.
      expect(schedule.event.event_id).not.toBe(lead.event.event_id);
    });
  });
});
