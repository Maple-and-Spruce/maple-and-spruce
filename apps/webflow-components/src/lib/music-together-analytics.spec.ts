import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MUSIC_TOGETHER_PIXEL_ID,
  buildDemoRsvpPixelEvent,
  buildInitiateCheckoutPixelEvent,
  buildInterestPixelEvent,
  buildMusicTogetherPurchaseDataLayerEvent,
  buildMusicTogetherPurchasePixelEvent,
  buildViewSectionPixelEvent,
  ensureMusicTogetherPixel,
  trackMusicTogetherDemoRsvp,
  trackMusicTogetherInitiateCheckout,
  trackMusicTogetherInterest,
  trackMusicTogetherPurchase,
  trackViewMusicTogetherSection,
} from './music-together-analytics';

const SECTION_ID = 'mtsec_abc123';
const SECTION_NAME = 'Tuesday 9:30am — Fall 2026';
const DEMO_ID = 'mtdemo_xyz789';

/** A fresh fake window with fbq + dataLayer spies. */
function fakeWindow() {
  const fbq = vi.fn();
  return { fbq, dataLayer: [] as Record<string, unknown>[] };
}

describe('pixel identity', () => {
  it('is the Music Together pixel, not the Maple & Spruce one', () => {
    expect(MUSIC_TOGETHER_PIXEL_ID).toBe('1562555242035326');
    expect(MUSIC_TOGETHER_PIXEL_ID).not.toBe('1625932185289127');
  });
});

describe('ensureMusicTogetherPixel', () => {
  it('inits the MT pixel and fires a scoped PageView exactly once', () => {
    const win = fakeWindow();

    expect(ensureMusicTogetherPixel(win)).toBe(true);
    expect(win.fbq).toHaveBeenCalledWith('init', MUSIC_TOGETHER_PIXEL_ID);
    expect(win.fbq).toHaveBeenCalledWith(
      'trackSingle',
      MUSIC_TOGETHER_PIXEL_ID,
      'PageView'
    );

    // Idempotent — three widgets can mount on one page without re-initing.
    win.fbq.mockClear();
    expect(ensureMusicTogetherPixel(win)).toBe(true);
    expect(win.fbq).not.toHaveBeenCalled();
  });

  it('reports unavailable when fbevents has not loaded', () => {
    expect(ensureMusicTogetherPixel({})).toBe(false);
    expect(ensureMusicTogetherPixel(null)).toBe(false);
  });
});

/**
 * The load-bearing guarantee of this module. The Maple & Spruce pixel is loaded
 * site-wide via GTM and MT pages share that site, so a bare `fbq('track', …)`
 * would broadcast MT conversions into the Maple & Spruce dataset and defeat the
 * entire point of the separate MT ad account.
 */
describe('pixel isolation', () => {
  const cases: Array<[string, (win: unknown) => void]> = [
    [
      'ViewContent',
      (win) =>
        trackViewMusicTogetherSection(win, {
          sectionId: SECTION_ID,
          sectionName: SECTION_NAME,
          priceFullCents: 25200,
        }),
    ],
    [
      'Lead',
      (win) =>
        trackMusicTogetherInterest(win, {
          interestedSectionIds: [SECTION_ID],
          alreadyOnList: false,
        }),
    ],
    [
      'Schedule',
      (win) =>
        trackMusicTogetherDemoRsvp(win, {
          demoId: DEMO_ID,
          demoDateTime: '2026-09-05T13:30:00.000Z',
          rsvpStatus: 'confirmed',
        }),
    ],
    [
      'InitiateCheckout',
      (win) =>
        trackMusicTogetherInitiateCheckout(win, {
          sectionId: SECTION_ID,
          sectionName: SECTION_NAME,
          priceFullCents: 25200,
        }),
    ],
    [
      'Purchase',
      (win) =>
        trackMusicTogetherPurchase(win, {
          registrationId: 'mtreg_1',
          sectionId: SECTION_ID,
          sectionName: SECTION_NAME,
          totalCommittedCents: 25200,
          amountChargedCents: 25200,
          paymentPlan: 'full',
        }),
    ],
  ];

  it.each(cases)('%s uses trackSingle scoped to the MT pixel', (name, track) => {
    const win = fakeWindow();
    track(win);

    const trackCalls = win.fbq.mock.calls.filter(
      (c) => c[0] === 'trackSingle' && c[2] === name
    );
    expect(trackCalls).toHaveLength(1);
    expect(trackCalls[0][1]).toBe(MUSIC_TOGETHER_PIXEL_ID);

    // No un-scoped `track` call anywhere — that would hit the M&S pixel too.
    expect(win.fbq.mock.calls.some((c) => c[0] === 'track')).toBe(false);
  });

  it('never touches fbq when fbevents is absent, but still fills the dataLayer', () => {
    const win = { dataLayer: [] as Record<string, unknown>[] };
    trackMusicTogetherInterest(win, {
      interestedSectionIds: [],
      alreadyOnList: false,
    });
    // GA4 is independent of the Pixel — an ad blocker must not cost us GA4.
    expect(win.dataLayer).toHaveLength(1);
    expect(win.dataLayer[0]).toMatchObject({ event: 'generate_lead' });
  });

  it('is a no-op on a non-object window instead of throwing', () => {
    expect(() =>
      trackMusicTogetherInterest(null, {
        interestedSectionIds: [],
        alreadyOnList: false,
      })
    ).not.toThrow();
  });
});

describe('event builders', () => {
  it('ViewContent carries the section id, category, and price', () => {
    const event = buildViewSectionPixelEvent({
      sectionId: SECTION_ID,
      sectionName: SECTION_NAME,
      priceFullCents: 25200,
    });

    expect(event.name).toBe('ViewContent');
    expect(event.params).toMatchObject({
      content_ids: [SECTION_ID],
      content_type: 'product',
      content_name: SECTION_NAME,
      content_category: 'music_together',
      value: 252,
      currency: 'USD',
    });
  });

  it('Lead and Schedule carry the SERVER-supplied eventID for dedup', () => {
    // Both events now have a server-side twin sent by the callable in the same
    // request. The callable returns the id it used; these builders must pass it
    // through untouched, because a drifted id means Meta books the browser and
    // server halves as two separate conversions.
    expect(
      buildInterestPixelEvent({
        interestedSectionIds: [],
        alreadyOnList: false,
        eventId: 'mt-interest-0123456789abcdef',
      }).eventID
    ).toBe('mt-interest-0123456789abcdef');

    expect(
      buildDemoRsvpPixelEvent({
        demoId: DEMO_ID,
        demoDateTime: '2026-09-05T13:30:00.000Z',
        rsvpStatus: 'confirmed',
        eventId: 'mt-demo-0123456789abcdef',
      }).eventID
    ).toBe('mt-demo-0123456789abcdef');
  });

  it('omits eventID when the server did not return one, rather than inventing one', () => {
    // A fabricated id would deduplicate against nothing and, worse, could
    // collide. No id at all is the honest degraded state.
    expect(
      buildDemoRsvpPixelEvent({
        demoId: DEMO_ID,
        demoDateTime: '2026-09-05T13:30:00.000Z',
        rsvpStatus: 'confirmed',
      }).eventID
    ).toBeUndefined();
  });

  it('Lead records which sections the demand points at', () => {
    const event = buildInterestPixelEvent({
      interestedSectionIds: [SECTION_ID, 'mtsec_def456'],
      alreadyOnList: true,
    });

    expect(event.name).toBe('Lead');
    expect(event.params).toMatchObject({
      content_category: 'music_together_interest',
      content_ids: [SECTION_ID, 'mtsec_def456'],
      already_on_list: true,
    });
  });

  it('Schedule distinguishes a booked demo seat from a demo waitlist join', () => {
    const confirmed = buildDemoRsvpPixelEvent({
      demoId: DEMO_ID,
      demoDateTime: '2026-09-05T13:30:00.000Z',
      rsvpStatus: 'confirmed',
    });
    const waitlisted = buildDemoRsvpPixelEvent({
      demoId: DEMO_ID,
      demoDateTime: '2026-09-05T13:30:00.000Z',
      rsvpStatus: 'waitlisted',
    });

    expect(confirmed.name).toBe('Schedule');
    // A distinct event from the interest list's `Lead`, so the demo campaign
    // and the interest campaign can bid toward different outcomes.
    expect(confirmed.name).not.toBe('Lead');
    expect(confirmed.params['rsvp_status']).toBe('confirmed');
    expect(waitlisted.params['rsvp_status']).toBe('waitlisted');
  });

  it('InitiateCheckout reports the sibling-discounted family price', () => {
    const event = buildInitiateCheckoutPixelEvent({
      sectionId: SECTION_ID,
      sectionName: SECTION_NAME,
      priceFullCents: 37800,
    });

    expect(event.name).toBe('InitiateCheckout');
    expect(event.params).toMatchObject({ value: 378, num_items: 1 });
  });
});

/**
 * `sendMusicTogetherConversion` keys its server-side Purchase `mt-<id>`. If the
 * browser event's `eventID` drifts from that format, Meta stops collapsing the
 * pair and every MT enrollment is counted twice.
 */
describe('Purchase dedup contract with the Conversions API', () => {
  it('uses the exact `mt-<registrationId>` id the server sends', () => {
    const event = buildMusicTogetherPurchasePixelEvent({
      registrationId: 'mtreg_abc',
      sectionId: SECTION_ID,
      sectionName: SECTION_NAME,
      totalCommittedCents: 25200,
      amountChargedCents: 12600,
      paymentPlan: 'installments',
    });

    expect(event.eventID).toBe('mt-mtreg_abc');
  });

  it('passes eventID through to fbq so Meta can deduplicate', () => {
    const win = fakeWindow();
    trackMusicTogetherPurchase(win, {
      registrationId: 'mtreg_abc',
      sectionId: SECTION_ID,
      sectionName: SECTION_NAME,
      totalCommittedCents: 25200,
      amountChargedCents: 25200,
      paymentPlan: 'full',
    });

    const call = win.fbq.mock.calls.find((c) => c[2] === 'Purchase');
    expect(call?.[4]).toEqual({ eventID: 'mt-mtreg_abc' });
  });

  /**
   * The server reports `totalCommittedCents` as `value` and the cash collected
   * as `amount_paid_today`. A deduplicated pair with mismatched values is
   * resolved unpredictably by Meta, so the browser event must agree.
   */
  it('reports the FULL committed tuition as value, not the installment charged', () => {
    const event = buildMusicTogetherPurchasePixelEvent({
      registrationId: 'mtreg_inst',
      sectionId: SECTION_ID,
      sectionName: SECTION_NAME,
      totalCommittedCents: 25200,
      amountChargedCents: 12600,
      paymentPlan: 'installments',
    });

    expect(event.params['value']).toBe(252);
    expect(event.params['amount_paid_today']).toBe(126);
    expect(event.params['payment_plan']).toBe('installments');
  });

  it('keys the GA4 purchase on the registration id', () => {
    const event = buildMusicTogetherPurchaseDataLayerEvent({
      registrationId: 'mtreg_ga4',
      sectionId: SECTION_ID,
      sectionName: SECTION_NAME,
      totalCommittedCents: 25200,
      amountChargedCents: 25200,
      paymentPlan: 'full',
    });

    expect(event.event).toBe('purchase');
    expect(event['ecommerce']).toMatchObject({
      transaction_id: 'mtreg_ga4',
      value: 252,
    });
  });
});

describe('dataLayer dispatch', () => {
  let win: ReturnType<typeof fakeWindow>;

  beforeEach(() => {
    win = fakeWindow();
  });

  it('pushes one GA4 event per tracked action, preserving prior entries', () => {
    win.dataLayer.push({ event: 'pre-existing' });

    trackViewMusicTogetherSection(win, {
      sectionId: SECTION_ID,
      sectionName: SECTION_NAME,
      priceFullCents: 25200,
    });
    trackMusicTogetherDemoRsvp(win, {
      demoId: DEMO_ID,
      demoDateTime: '2026-09-05T13:30:00.000Z',
      rsvpStatus: 'confirmed',
    });

    expect(win.dataLayer.map((e) => e['event'])).toEqual([
      'pre-existing',
      'view_item',
      'schedule',
    ]);
  });

  it('creates the dataLayer when the page has not made one yet', () => {
    const bare: { dataLayer?: Record<string, unknown>[] } = {};
    trackMusicTogetherInterest(bare, {
      interestedSectionIds: [SECTION_ID],
      alreadyOnList: false,
    });
    expect(bare.dataLayer).toHaveLength(1);
  });
});
