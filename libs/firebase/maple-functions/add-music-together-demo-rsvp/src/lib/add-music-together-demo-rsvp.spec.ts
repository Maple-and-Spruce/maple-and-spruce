import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (
  data: unknown,
  context: { ip?: string; userAgent?: string },
  secrets: Record<string, string>
) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  findById: vi.fn(),
  demoRsvpAdd: vi.fn(),
  markSignupEmailSent: vi.fn(),
  queueMail: vi.fn(),
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
    queueMail: mocks.queueMail,
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError(
        'invalid-argument',
        `validation: ${Object.keys(errs).join(',')}`
      );
    },
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} ${id} not found`);
    },
    throwFailedPrecondition: (msg: string) => {
      throw new HttpsError('failed-precondition', msg);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: { findById: mocks.findById },
  MusicTogetherDemoRsvpRepository: {
    add: mocks.demoRsvpAdd,
    markSignupEmailSent: mocks.markSignupEmailSent,
  },
}));

// Only the transport is mocked. The event BUILDERS and the id derivation are
// the real implementations, because the whole point of the server event is that
// its `event_id` and hashed match keys are byte-identical to what the browser
// half and Meta expect — a stubbed builder would assert nothing.
vi.mock('@maple/firebase/meta-capi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@maple/firebase/meta-capi')>()),
  trySendMetaCapiEvents: mocks.trySendMetaCapiEvents,
}));

// The callable declares its Meta params at module scope; the emulator/deploy
// supplies them for real. Under vitest there is no params runtime, so stub
// `defineString` to a param-shaped object with a readable value.
vi.mock('firebase-functions/params', () => ({
  defineString: (name: string, opts?: { default?: string }) => ({
    value: () => opts?.default ?? `stub-${name}`,
  }),
}));

import './add-music-together-demo-rsvp';
import {
  buildUserData,
  musicTogetherDemoRsvpEventId,
} from '@maple/firebase/meta-capi';

const REQUEST_CONTEXT = { ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (Test)' };

function run(data: unknown, context = REQUEST_CONTEXT) {
  return (mocks.capturedHandler as unknown as Handler)(data, context, {
    META_CAPI_TOKEN: 'test-token',
  });
}

/** The single event handed to the (mocked) transport, with its config. */
function sentCapi() {
  const [config, events] = mocks.trySendMetaCapiEvents.mock.calls[0];
  return { config, event: events[0] };
}

const validRsvp = {
  demoId: 'demo-1',
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
};

describe('addMusicTogetherDemoRsvp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({
      id: 'demo-1',
      visible: true,
      capacityFamilies: 8,
      // Offsite on purpose — demos are often held at a library, not the studio.
      location: 'Morgantown Public Library',
      dateTime: new Date('2026-07-22T14:00:00Z'), // Wed 10am ET
    });
    mocks.demoRsvpAdd.mockResolvedValue({
      created: true,
      entry: {
        demoId: 'demo-1',
        name: 'Jamie Rivera',
        email: 'jamie@example.com',
        status: 'confirmed',
      },
    });
    mocks.queueMail.mockResolvedValue(true);
    mocks.trySendMetaCapiEvents.mockResolvedValue(true);
  });

  it('confirms an RSVP under capacity (added=true, status=confirmed)', async () => {
    const result = (await run(validRsvp)) as {
      added: boolean;
      status: string;
    };
    expect(mocks.demoRsvpAdd).toHaveBeenCalledWith(
      {
        demoId: 'demo-1',
        name: 'Jamie Rivera',
        email: 'jamie@example.com',
        capacityFamilies: 8,
      },
      expect.any(Object)
    );
    expect(result).toEqual({
      added: true,
      status: 'confirmed',
      eventId: musicTogetherDemoRsvpEventId('demo-1', 'jamie@example.com'),
    });
  });

  it('waitlists an RSVP past capacity', async () => {
    mocks.demoRsvpAdd.mockResolvedValue({
      created: true,
      entry: {
        demoId: 'demo-1',
        name: 'Jamie Rivera',
        email: 'jamie@example.com',
        status: 'waitlisted',
      },
    });
    const result = (await run(validRsvp)) as { status: string };
    expect(result.status).toBe('waitlisted');
  });

  it('is idempotent — a repeat RSVP reports added=false with prior status', async () => {
    mocks.demoRsvpAdd.mockResolvedValue({
      created: false,
      entry: { status: 'waitlisted' },
    });
    const result = (await run(validRsvp)) as {
      added: boolean;
      status: string;
    };
    expect(result).toMatchObject({ added: false, status: 'waitlisted' });
  });

  it('rejects a missing demoId before touching the repository', async () => {
    await expect(run({ ...validRsvp, demoId: '' })).rejects.toThrow(/validation/);
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    await expect(run({ ...validRsvp, email: 'nope' })).rejects.toThrow(/validation/);
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  it('404s when the demo does not exist', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(run(validRsvp)).rejects.toThrow(/not found/);
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  it('rejects an RSVP to a hidden demo', async () => {
    mocks.findById.mockResolvedValue({
      id: 'demo-1',
      visible: false,
      capacityFamilies: 8,
    });
    await expect(run(validRsvp)).rejects.toThrow(/not open/);
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  describe('confirmation email', () => {
    it('queues the confirmed template with the demo\'s own location', async () => {
      await run(validRsvp);

      expect(mocks.queueMail).toHaveBeenCalledTimes(1);
      const mail = mocks.queueMail.mock.calls[0][0];
      expect(mail.to).toBe('jamie@example.com');
      expect(mail.templateName).toBe('music-together-demo-rsvp-confirmed');
      expect(mail.sender).toBe('music-together');
      expect(mail.data.caregiverName).toBe('Jamie Rivera');
      // Demos are regularly offsite — the studio address would send the family
      // to the wrong building.
      expect(mail.data.demoLocation).toBe('Morgantown Public Library');
      expect(mail.data.demoDay).toBe('Wednesday');
      expect(mail.data.demoDate).toBe('Wednesday, July 22');
      expect(mail.data.demoTime).toBe('10:00 AM');
      expect(mocks.markSignupEmailSent).toHaveBeenCalledWith(
        'demo-1',
        'jamie@example.com',
        expect.any(Date)
      );
    });

    it('queues the WAITLISTED template past capacity, not a confirmation', async () => {
      mocks.demoRsvpAdd.mockResolvedValue({
        created: true,
        entry: {
          demoId: 'demo-1',
          name: 'Jamie Rivera',
          email: 'jamie@example.com',
          status: 'waitlisted',
        },
      });

      await run(validRsvp);

      expect(mocks.queueMail.mock.calls[0][0].templateName).toBe(
        'music-together-demo-rsvp-waitlisted'
      );
    });

    it('sends NOTHING on a repeat RSVP', async () => {
      // This endpoint is public and unauthenticated — emailing on every call
      // would let anyone mailbomb an address by replaying the same RSVP.
      mocks.demoRsvpAdd.mockResolvedValue({
        created: false,
        entry: {
          demoId: 'demo-1',
          email: 'jamie@example.com',
          status: 'confirmed',
        },
      });

      const result = (await run(validRsvp)) as { added: boolean };

      expect(result.added).toBe(false);
      expect(mocks.queueMail).not.toHaveBeenCalled();
      expect(mocks.markSignupEmailSent).not.toHaveBeenCalled();
    });

    it('does not stamp when queueMail declines the recipient', async () => {
      mocks.queueMail.mockResolvedValue(false);

      await run(validRsvp);

      expect(mocks.markSignupEmailSent).not.toHaveBeenCalled();
    });

    it('still confirms the RSVP when queuing mail throws', async () => {
      // The seat is already reserved — a mail failure must never surface as
      // "your RSVP didn't take".
      mocks.queueMail.mockRejectedValue(new Error('firestore unavailable'));

      const result = (await run(validRsvp)) as {
        added: boolean;
        status: string;
      };

      expect(result).toMatchObject({ added: true, status: 'confirmed' });
      expect(mocks.markSignupEmailSent).not.toHaveBeenCalled();
    });
  });

  describe('attribution capture', () => {
    it('persists the widget cookies alongside the SERVER-observed ip + ua', async () => {
      await run({
        ...validRsvp,
        metaAttribution: {
          fbp: 'fb.1.1700000000000.987654321',
          fbc: 'fb.1.1700000000000.IwAR-click',
          eventSourceUrl: 'https://mapleandsprucefolkarts.com/music-together-demo',
        },
      });

      expect(mocks.demoRsvpAdd.mock.calls[0][1]).toEqual({
        fbp: 'fb.1.1700000000000.987654321',
        fbc: 'fb.1.1700000000000.IwAR-click',
        eventSourceUrl: 'https://mapleandsprucefolkarts.com/music-together-demo',
        // NOT from the payload — a caller must not be able to write these into
        // another family's attribution.
        clientIp: '203.0.113.9',
        clientUserAgent: 'Mozilla/5.0 (Test)',
      });
    });

    it('still records an RSVP that carries no attribution at all', async () => {
      await run(validRsvp);
      expect(mocks.demoRsvpAdd.mock.calls[0][1]).toEqual({
        fbp: undefined,
        fbc: undefined,
        eventSourceUrl: undefined,
        clientIp: '203.0.113.9',
        clientUserAgent: 'Mozilla/5.0 (Test)',
      });
    });
  });

  describe('Meta Conversions API `Schedule`', () => {
    it('sends one Schedule to the MUSIC TOGETHER pixel with the shared event_id', async () => {
      const result = (await run({
        ...validRsvp,
        metaAttribution: {
          fbp: 'fb.1.1.p',
          fbc: 'fb.1.1.c',
          eventSourceUrl: 'https://mapleandsprucefolkarts.com/music-together-demo',
        },
      })) as { eventId: string };

      expect(mocks.trySendMetaCapiEvents).toHaveBeenCalledTimes(1);
      const { config, event } = sentCapi();

      // MT advertises from its own ad account. Landing this in the Maple &
      // Spruce dataset would make the separate account pointless.
      expect(config.pixelId).toBe('1562555242035326');
      expect(config.accessToken).toBe('test-token');
      // Inline on a user-facing submit, so the wait must be capped well under
      // the library's 5s default.
      expect(config.timeoutMs).toBe(2000);

      expect(event.eventName).toBe('Schedule');
      // The response value and the wire value MUST be the same string, or the
      // browser Pixel event stops deduplicating and every RSVP counts twice.
      expect(event.eventId).toBe(result.eventId);
      expect(event.eventId).toBe(
        musicTogetherDemoRsvpEventId('demo-1', 'jamie@example.com')
      );
      expect(event.eventSourceUrl).toBe(
        'https://mapleandsprucefolkarts.com/music-together-demo'
      );
      expect(event.customData).toMatchObject({
        content_ids: ['demo-1'],
        rsvp_status: 'confirmed',
      });
    });

    it('never puts the family email in the event_id', async () => {
      // Both of these collections are keyed BY EMAIL, so the obvious
      // `mt-demo-<docId>` would ship a plaintext address to Meta.
      const result = (await run(validRsvp)) as { eventId: string };
      expect(result.eventId).toMatch(/^mt-demo-[0-9a-f]{16}$/);
      expect(result.eventId).not.toContain('jamie');
      expect(result.eventId).not.toContain('@');
    });

    it('scopes the event_id per demo, so a second demo is a second conversion', () => {
      expect(musicTogetherDemoRsvpEventId('demo-1', 'jamie@example.com')).not.toBe(
        musicTogetherDemoRsvpEventId('demo-2', 'jamie@example.com')
      );
    });

    it('hashes the email and passes fbp / fbc / ip / ua through for matching', async () => {
      await run({
        ...validRsvp,
        metaAttribution: { fbp: 'fb.1.1.p', fbc: 'fb.1.1.c' },
      });

      const userData = buildUserData(sentCapi().event.user);
      // SHA-256 of the lowercased email — never the address itself.
      expect(userData['em']).toEqual([
        createHash('sha256').update('jamie@example.com').digest('hex'),
      ]);
      expect(userData).not.toHaveProperty('email');
      expect(userData['fn']).toEqual([
        createHash('sha256').update('jamie').digest('hex'),
      ]);
      // fbp/fbc are Meta's own ids and go over RAW, not hashed.
      expect(userData['fbp']).toBe('fb.1.1.p');
      expect(userData['fbc']).toBe('fb.1.1.c');
      expect(userData['client_ip_address']).toBe('203.0.113.9');
      expect(userData['client_user_agent']).toBe('Mozilla/5.0 (Test)');
      // Known unconditionally.
      expect(userData['country']).toEqual([
        createHash('sha256').update('us').digest('hex'),
      ]);
      expect(userData['external_id']).toEqual([
        createHash('sha256').update('jamie@example.com').digest('hex'),
      ]);
    });

    it('reports a waitlist join as Schedule with rsvp_status=waitlisted', async () => {
      // A full demo is still real intent — worth optimizing toward — but it is
      // not a seat, so the distinction has to survive to Events Manager.
      mocks.demoRsvpAdd.mockResolvedValue({
        created: true,
        entry: {
          demoId: 'demo-1',
          name: 'Jamie Rivera',
          email: 'jamie@example.com',
          status: 'waitlisted',
        },
      });

      await run(validRsvp);

      expect(sentCapi().event.customData).toMatchObject({
        rsvp_status: 'waitlisted',
      });
    });

    it('sends NOTHING on a repeat RSVP, but still returns the same event_id', async () => {
      // Public + unauthenticated: firing on every call would let anyone inflate
      // a campaign's conversion count by replaying an RSVP.
      mocks.demoRsvpAdd.mockResolvedValue({
        created: false,
        entry: {
          demoId: 'demo-1',
          name: 'Jamie Rivera',
          email: 'jamie@example.com',
          status: 'confirmed',
        },
      });

      const result = (await run(validRsvp)) as { eventId: string };

      expect(mocks.trySendMetaCapiEvents).not.toHaveBeenCalled();
      expect(result.eventId).toBe(
        musicTogetherDemoRsvpEventId('demo-1', 'jamie@example.com')
      );
    });

    it('still confirms the RSVP when the CAPI send fails', async () => {
      // `trySendMetaCapiEvents` swallows its own errors, but assert the whole
      // path anyway: a marketing beacon must never be able to tell a family
      // their RSVP did not take.
      mocks.trySendMetaCapiEvents.mockResolvedValue(false);

      const result = (await run(validRsvp)) as {
        added: boolean;
        status: string;
      };

      expect(result).toMatchObject({ added: true, status: 'confirmed' });
      expect(mocks.queueMail).toHaveBeenCalledTimes(1);
    });

    it('still confirms the RSVP if the CAPI transport throws outright', async () => {
      mocks.trySendMetaCapiEvents.mockRejectedValue(new Error('network down'));

      const result = (await run(validRsvp)) as {
        added: boolean;
        status: string;
      };

      expect(result).toMatchObject({ added: true, status: 'confirmed' });
    });
  });
});
