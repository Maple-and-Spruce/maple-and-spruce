import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findById: vi.fn(),
  demoRsvpAdd: vi.fn(),
  markSignupEmailSent: vi.fn(),
  queueMail: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  const endpoint = {
    withOptions: vi.fn(() => endpoint),
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

import './add-music-together-demo-rsvp';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
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
  });

  it('confirms an RSVP under capacity (added=true, status=confirmed)', async () => {
    const result = (await run(validRsvp)) as {
      added: boolean;
      status: string;
    };
    expect(mocks.demoRsvpAdd).toHaveBeenCalledWith({
      demoId: 'demo-1',
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
      capacityFamilies: 8,
    });
    expect(result).toEqual({ added: true, status: 'confirmed' });
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
    expect(result).toEqual({ added: false, status: 'waitlisted' });
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

      expect(result).toEqual({ added: true, status: 'confirmed' });
      expect(mocks.markSignupEmailSent).not.toHaveBeenCalled();
    });
  });
});
