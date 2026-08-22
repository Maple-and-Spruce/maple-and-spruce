import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (
  data: unknown,
  context: { ip?: string; userAgent?: string },
  secrets: Record<string, string>
) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  sectionFindById: vi.fn(),
  interestUpsert: vi.fn(),
  trySendMetaCapiEvents: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  const endpoint = {
    withOptions: vi.fn(() => endpoint),
    usingSecrets: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-fn';
    }),
  };
  return {
    Functions: { endpoint },
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError(
        'invalid-argument',
        `validation: ${Object.keys(errs).join(',')}`
      );
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findById: mocks.sectionFindById },
  MusicTogetherInterestRepository: { upsert: mocks.interestUpsert },
}));

// Transport only — the real event builder and id derivation run, because their
// exact output is the contract with the browser Pixel and with Meta.
vi.mock('@maple/firebase/meta-capi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@maple/firebase/meta-capi')>()),
  trySendMetaCapiEvents: mocks.trySendMetaCapiEvents,
}));

vi.mock('firebase-functions/params', () => ({
  defineString: (name: string, opts?: { default?: string }) => ({
    value: () => opts?.default ?? `stub-${name}`,
  }),
}));

import './add-music-together-interest';
import {
  buildUserData,
  musicTogetherInterestEventId,
} from '@maple/firebase/meta-capi';

const REQUEST_CONTEXT = { ip: '198.51.100.7', userAgent: 'Mozilla/5.0 (Test)' };

function run(data: unknown, context = REQUEST_CONTEXT) {
  return (mocks.capturedHandler as unknown as Handler)(data, context, {
    META_CAPI_TOKEN: 'test-token',
  });
}

function sentCapi() {
  const [config, events] = mocks.trySendMetaCapiEvents.mock.calls[0];
  return { config, event: events[0] };
}

const validEntry = {
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  interestedSectionIds: ['sec-1', 'sec-2'],
  preferenceNote: 'Thursdays please',
  alternateTimesNote: 'Saturday mornings',
  notes: 'Two kids',
};

describe('addMusicTogetherInterest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sectionFindById.mockResolvedValue({ id: 'sec', visible: true });
    mocks.interestUpsert.mockResolvedValue({ created: true });
    mocks.trySendMetaCapiEvents.mockResolvedValue(true);
  });

  it('records interest with the multi-section + preference fields', async () => {
    const result = (await run(validEntry)) as { added: boolean };
    expect(mocks.interestUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jamie@example.com',
        interestedSectionIds: ['sec-1', 'sec-2'],
        preferenceNote: 'Thursdays please',
        alternateTimesNote: 'Saturday mornings',
        notes: 'Two kids',
      }),
      expect.any(Object)
    );
    expect(result.added).toBe(true);
  });

  it('is idempotent — a repeat email reports added=false', async () => {
    mocks.interestUpsert.mockResolvedValue({ created: false });
    const result = (await run(validEntry)) as { added: boolean };
    expect(result.added).toBe(false);
  });

  it('de-dupes section ids before verifying + storing', async () => {
    await run({ ...validEntry, interestedSectionIds: ['sec-1', 'sec-1'] });
    expect(mocks.sectionFindById).toHaveBeenCalledTimes(1);
    expect(mocks.interestUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ interestedSectionIds: ['sec-1'] }),
      expect.any(Object)
    );
  });

  it('allows an entry with no sections when alternate times are given', async () => {
    const result = (await run({
      name: 'No Fit',
      email: 'nofit@example.com',
      interestedSectionIds: [],
      alternateTimesNote: 'Weekday afternoons',
    })) as { added: boolean };
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
    expect(result.added).toBe(true);
  });

  it('rejects an entirely blank interest signal before any write', async () => {
    await expect(
      run({ name: 'X', email: 'x@example.com', interestedSectionIds: [] })
    ).rejects.toThrow(/validation/);
    expect(mocks.interestUpsert).not.toHaveBeenCalled();
  });

  it('rejects invalid input before touching sections', async () => {
    await expect(run({ ...validEntry, email: 'nope' })).rejects.toThrow(
      /validation/
    );
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
  });

  it('rejects an unknown / hidden section', async () => {
    mocks.sectionFindById.mockResolvedValue(undefined);
    await expect(run(validEntry)).rejects.toThrow(/not available/i);
    expect(mocks.interestUpsert).not.toHaveBeenCalled();
  });

  describe('attribution capture', () => {
    it('persists widget cookies plus the SERVER-observed ip + ua', async () => {
      await run({
        ...validEntry,
        metaAttribution: {
          fbp: 'fb.1.1700000000000.111',
          fbc: 'fb.1.1700000000000.IwAR-click',
          eventSourceUrl:
            'https://mapleandsprucefolkarts.com/music-together-interest',
        },
      });

      expect(mocks.interestUpsert.mock.calls[0][1]).toEqual({
        fbp: 'fb.1.1700000000000.111',
        fbc: 'fb.1.1700000000000.IwAR-click',
        eventSourceUrl:
          'https://mapleandsprucefolkarts.com/music-together-interest',
        // Off the HTTP request, never the payload.
        clientIp: '198.51.100.7',
        clientUserAgent: 'Mozilla/5.0 (Test)',
      });
    });
  });

  describe('Meta Conversions API `Lead`', () => {
    it('sends one Lead to the MUSIC TOGETHER pixel with the shared event_id', async () => {
      const result = (await run({
        ...validEntry,
        metaAttribution: {
          fbp: 'fb.1.1.p',
          fbc: 'fb.1.1.c',
          eventSourceUrl:
            'https://mapleandsprucefolkarts.com/music-together-interest',
        },
      })) as { eventId: string };

      expect(mocks.trySendMetaCapiEvents).toHaveBeenCalledTimes(1);
      const { config, event } = sentCapi();

      expect(config.pixelId).toBe('1562555242035326');
      expect(config.timeoutMs).toBe(2000);
      expect(event.eventName).toBe('Lead');
      expect(event.eventId).toBe(result.eventId);
      expect(event.eventId).toBe(
        musicTogetherInterestEventId('jamie@example.com')
      );
      expect(event.customData).toMatchObject({
        content_ids: ['sec-1', 'sec-2'],
        content_name: 'music-together-interest',
      });
    });

    it('never puts the family email in the event_id', async () => {
      const result = (await run(validEntry)) as { eventId: string };
      expect(result.eventId).toMatch(/^mt-interest-[0-9a-f]{16}$/);
      expect(result.eventId).not.toContain('jamie');
      expect(result.eventId).not.toContain('@');
    });

    it('hashes the email and forwards fbp / fbc / ip / ua', async () => {
      await run({
        ...validEntry,
        metaAttribution: { fbp: 'fb.1.1.p', fbc: 'fb.1.1.c' },
      });

      const userData = buildUserData(sentCapi().event.user);
      expect(userData['em']).toEqual([
        createHash('sha256').update('jamie@example.com').digest('hex'),
      ]);
      expect(userData['fbp']).toBe('fb.1.1.p');
      expect(userData['fbc']).toBe('fb.1.1.c');
      expect(userData['client_ip_address']).toBe('198.51.100.7');
      expect(userData['client_user_agent']).toBe('Mozilla/5.0 (Test)');
      expect(userData['country']).toEqual([
        createHash('sha256').update('us').digest('hex'),
      ]);
    });

    it('uses the SAME external_id as the demo RSVP, so Meta sees one person', async () => {
      // The lowercased email is our cross-surface person id. It is what lets a
      // demo RSVP, an interest signup, and a later enrollment resolve to the
      // same human in Meta's graph.
      await run(validEntry);
      const userData = buildUserData(sentCapi().event.user);
      expect(userData['external_id']).toEqual([
        createHash('sha256').update('jamie@example.com').digest('hex'),
      ]);
    });

    it('sends NOTHING on a re-submit, but returns the same stable event_id', async () => {
      // A family refining their section picks is engagement, not new demand —
      // and on a public endpoint, counting it would let a replay inflate the
      // campaign's Lead total.
      mocks.interestUpsert.mockResolvedValue({ created: false });

      const result = (await run(validEntry)) as { eventId: string };

      expect(mocks.trySendMetaCapiEvents).not.toHaveBeenCalled();
      expect(result.eventId).toBe(
        musicTogetherInterestEventId('jamie@example.com')
      );
    });

    it('still records the signup when the CAPI send fails', async () => {
      mocks.trySendMetaCapiEvents.mockResolvedValue(false);
      const result = (await run(validEntry)) as { added: boolean };
      expect(result.added).toBe(true);
    });

    it('still records the signup if the CAPI transport throws outright', async () => {
      mocks.trySendMetaCapiEvents.mockRejectedValue(new Error('network down'));
      const result = (await run(validEntry)) as { added: boolean };
      expect(result.added).toBe(true);
    });
  });
});
