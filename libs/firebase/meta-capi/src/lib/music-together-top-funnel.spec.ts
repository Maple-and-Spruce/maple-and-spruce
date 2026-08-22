import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { buildUserData } from './meta-capi';
import {
  buildMusicTogetherDemoRsvpEvent,
  buildMusicTogetherInterestEvent,
  musicTogetherDemoRsvpEventId,
  musicTogetherInterestEventId,
  MT_TOP_FUNNEL_CAPI_TIMEOUT_MS,
} from './music-together-top-funnel';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('event ids', () => {
  it('carries no PII — the collections are keyed BY EMAIL', () => {
    // `musicTogetherDemos/{demoId}/rsvps/{email}` and
    // `musicTogetherInterest/{email}`, so the obvious `mt-demo-<docId>` would
    // ship a plaintext address to Meta in an unhashed field.
    const demo = musicTogetherDemoRsvpEventId('demo-1', 'Jamie@Example.com');
    const interest = musicTogetherInterestEventId('Jamie@Example.com');

    expect(demo).toMatch(/^mt-demo-[0-9a-f]{16}$/);
    expect(interest).toMatch(/^mt-interest-[0-9a-f]{16}$/);
    for (const id of [demo, interest]) {
      expect(id).not.toContain('@');
      expect(id.toLowerCase()).not.toContain('jamie');
      expect(id.toLowerCase()).not.toContain('example');
    }
  });

  it('is stable across case and whitespace, so the pair always deduplicates', () => {
    // The browser passes the server's value through verbatim, but the id must
    // still be reproducible from the stored document alone — that is what makes
    // promoting this to a Firestore trigger a no-op on the wire.
    expect(musicTogetherDemoRsvpEventId('demo-1', '  JAMIE@example.com ')).toBe(
      musicTogetherDemoRsvpEventId('demo-1', 'jamie@example.com')
    );
    expect(musicTogetherInterestEventId(' Jamie@Example.COM')).toBe(
      musicTogetherInterestEventId('jamie@example.com')
    );
  });

  it('scopes a demo RSVP per demo, and an interest signup per family', () => {
    // A second demo is a genuinely new conversion; a second interest submit is
    // not, so its id is deliberately email-only.
    expect(musicTogetherDemoRsvpEventId('demo-1', 'a@b.com')).not.toBe(
      musicTogetherDemoRsvpEventId('demo-2', 'a@b.com')
    );
    expect(musicTogetherDemoRsvpEventId('demo-1', 'a@b.com')).not.toBe(
      musicTogetherDemoRsvpEventId('demo-1', 'c@d.com')
    );
  });

  it('never collides across the two event types', () => {
    expect(musicTogetherInterestEventId('a@b.com')).not.toBe(
      musicTogetherDemoRsvpEventId('a@b.com', 'a@b.com')
    );
  });
});

describe('buildMusicTogetherDemoRsvpEvent', () => {
  const input = {
    demoId: 'demo-1',
    email: 'Jamie@Example.com',
    firstName: 'Jamie',
    lastName: 'Rivera',
    demoDateTime: '2026-09-05T14:00:00.000Z',
    rsvpStatus: 'confirmed' as const,
    fbp: 'fb.1.1700000000000.111',
    fbc: 'fb.1.1700000000000.IwAR-click',
    eventSourceUrl: 'https://mapleandsprucefolkarts.com/music-together-demo',
    clientIp: '203.0.113.9',
    clientUserAgent: 'Mozilla/5.0',
  };

  it('is a Schedule, not a Lead', () => {
    // Booking a specific time is stronger intent than joining a list. Merging
    // them would make the two MT campaigns compete for one conversion pool.
    expect(buildMusicTogetherDemoRsvpEvent(input).eventName).toBe('Schedule');
  });

  it('carries the shared dedup id and the demo as content_ids', () => {
    const event = buildMusicTogetherDemoRsvpEvent(input);
    expect(event.eventId).toBe(
      musicTogetherDemoRsvpEventId('demo-1', 'Jamie@Example.com')
    );
    expect(event.customData).toMatchObject({
      content_ids: ['demo-1'],
      content_name: 'music-together-demo',
      demo_date_time: '2026-09-05T14:00:00.000Z',
      rsvp_status: 'confirmed',
    });
    expect(event.eventSourceUrl).toBe(input.eventSourceUrl);
    expect(event.actionSource).toBe('website');
  });

  it('distinguishes a waitlist join from a booked seat', () => {
    const event = buildMusicTogetherDemoRsvpEvent({
      ...input,
      rsvpStatus: 'waitlisted',
    });
    expect(event.customData).toMatchObject({ rsvp_status: 'waitlisted' });
  });

  it('hashes every PII field and passes Meta ids through raw', () => {
    const data = buildUserData(buildMusicTogetherDemoRsvpEvent(input).user);

    expect(data['em']).toEqual([sha256('jamie@example.com')]);
    expect(data['fn']).toEqual([sha256('jamie')]);
    expect(data['ln']).toEqual([sha256('rivera')]);
    expect(data['country']).toEqual([sha256('us')]);
    expect(data['external_id']).toEqual([sha256('jamie@example.com')]);
    // fbp / fbc are Meta's own identifiers — hashing them would break matching.
    expect(data['fbp']).toBe(input.fbp);
    expect(data['fbc']).toBe(input.fbc);
    expect(data['client_ip_address']).toBe('203.0.113.9');
    expect(data['client_user_agent']).toBe('Mozilla/5.0');
    // The whole point: nothing readable leaves us.
    expect(JSON.stringify(data)).not.toContain('Jamie');
    expect(JSON.stringify(data)).not.toContain('@example.com');
  });

  it('omits attribution fields we never captured, rather than sending nulls', () => {
    const data = buildUserData(
      buildMusicTogetherDemoRsvpEvent({
        demoId: 'demo-1',
        email: 'a@b.com',
        rsvpStatus: 'confirmed',
        fbp: null,
        fbc: null,
        clientIp: null,
        clientUserAgent: null,
      }).user
    );
    expect(data).not.toHaveProperty('fbp');
    expect(data).not.toHaveProperty('fbc');
    expect(data).not.toHaveProperty('client_ip_address');
    // Country is knowable without the browser, so it is still there.
    expect(data['country']).toEqual([sha256('us')]);
  });
});

describe('buildMusicTogetherInterestEvent', () => {
  it('is a Lead carrying the sections the demand points at', () => {
    const event = buildMusicTogetherInterestEvent({
      email: 'jamie@example.com',
      firstName: 'Jamie',
      interestedSectionIds: ['sec-1', 'sec-2'],
    });

    expect(event.eventName).toBe('Lead');
    expect(event.eventId).toBe(musicTogetherInterestEventId('jamie@example.com'));
    expect(event.customData).toMatchObject({
      content_ids: ['sec-1', 'sec-2'],
      content_name: 'music-together-interest',
      // The server half only fires for a NEW entry, so this is always false.
      already_on_list: false,
    });
  });

  it('handles a notes-only signup with no sections checked', () => {
    const event = buildMusicTogetherInterestEvent({
      email: 'jamie@example.com',
      interestedSectionIds: [],
    });
    expect(event.customData).toMatchObject({ content_ids: [] });
  });

  it('uses the same external_id as the demo event, so Meta sees one person', () => {
    const interest = buildUserData(
      buildMusicTogetherInterestEvent({
        email: 'jamie@example.com',
        interestedSectionIds: [],
      }).user
    );
    const demo = buildUserData(
      buildMusicTogetherDemoRsvpEvent({
        demoId: 'demo-1',
        email: 'Jamie@Example.com',
        rsvpStatus: 'confirmed',
      }).user
    );
    expect(interest['external_id']).toEqual(demo['external_id']);
  });
});

describe('inline send budget', () => {
  it('is well under the library default, because these sends block a form submit', () => {
    // Unlike the Firestore-triggered `Purchase`, these two run inside the
    // request the family is waiting on. Five seconds of Meta is not something a
    // spinner should absorb.
    expect(MT_TOP_FUNNEL_CAPI_TIMEOUT_MS).toBeLessThanOrEqual(2_000);
  });
});
