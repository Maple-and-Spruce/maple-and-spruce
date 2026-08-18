import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  sectionFindById: vi.fn(),
  waitlistAdd: vi.fn(),
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
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwNotFound: (e: string, id: string) => {
      throw new HttpsError('not-found', `${e} not found: ${id}`);
    },
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError('invalid-argument', `validation: ${Object.keys(errs).join(',')}`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findById: mocks.sectionFindById },
  MusicTogetherWaitlistRepository: {
    add: mocks.waitlistAdd,
    markSignupEmailSent: mocks.markSignupEmailSent,
  },
}));

import './add-to-music-together-waitlist';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

const validEntry = {
  sectionId: 'sec-1',
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  availability: 'Tuesday mornings',
};

describe('addToMusicTogetherWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sectionFindById.mockResolvedValue({
      id: 'sec-1',
      name: 'Tuesdays 10am — Mixed Age',
      visible: true,
    });
    mocks.waitlistAdd.mockResolvedValue({
      created: true,
      entry: {
        id: 'jamie@example.com',
        sectionId: 'sec-1',
        name: 'Jamie Rivera',
        email: 'jamie@example.com',
        availability: 'Tuesday mornings',
        createdAt: new Date(),
      },
    });
    mocks.queueMail.mockResolvedValue(true);
  });

  it('adds a family to the waitlist and reports added=true', async () => {
    const result = (await run(validEntry)) as { added: boolean };
    expect(mocks.waitlistAdd).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: 'sec-1', email: 'jamie@example.com' })
    );
    expect(result.added).toBe(true);
  });

  it('accepts an email-only capture (no name — "coming soon" mode)', async () => {
    const result = (await run({
      sectionId: 'sec-1',
      email: 'coming-soon@example.com',
    })) as { added: boolean };
    expect(mocks.waitlistAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: 'sec-1',
        email: 'coming-soon@example.com',
      })
    );
    // No name is forwarded to the repository.
    const arg = mocks.waitlistAdd.mock.calls[0][0] as { name?: string };
    expect(arg.name).toBeUndefined();
    expect(result.added).toBe(true);
  });

  it('is idempotent — a repeat email reports added=false', async () => {
    mocks.waitlistAdd.mockResolvedValue({ created: false });
    const result = (await run(validEntry)) as { added: boolean };
    expect(result.added).toBe(false);
  });

  it('works for a visible section regardless of enrollment (no capacity gate)', async () => {
    mocks.sectionFindById.mockResolvedValue({
      id: 'sec-1',
      visible: true,
      enrollmentActive: true,
    });
    const result = (await run(validEntry)) as { added: boolean };
    expect(result.added).toBe(true);
  });

  it('rejects invalid input before touching the section', async () => {
    await expect(run({ ...validEntry, email: 'nope' })).rejects.toThrow(/validation/);
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
  });

  it('404s an unknown section', async () => {
    mocks.sectionFindById.mockResolvedValue(undefined);
    await expect(run(validEntry)).rejects.toThrow(/not found/i);
    expect(mocks.waitlistAdd).not.toHaveBeenCalled();
  });

  it('rejects a hidden section', async () => {
    mocks.sectionFindById.mockResolvedValue({ id: 'sec-1', visible: false });
    await expect(run(validEntry)).rejects.toThrow(/not available/i);
  });

  describe('confirmation email', () => {
    it('queues a Music Together confirmation and stamps the entry', async () => {
      await run(validEntry);

      expect(mocks.queueMail).toHaveBeenCalledTimes(1);
      const mail = mocks.queueMail.mock.calls[0][0];
      expect(mail.to).toBe('jamie@example.com');
      expect(mail.templateName).toBe('music-together-waitlist-confirmation');
      expect(mail.sender).toBe('music-together');
      expect(mail.data.name).toBe('Jamie Rivera');
      expect(mail.data.sectionName).toBe('Tuesdays 10am — Mixed Age');
      expect(mail.data.availability).toBe('Tuesday mornings');
      expect(mocks.markSignupEmailSent).toHaveBeenCalledWith(
        'sec-1',
        'jamie@example.com',
        expect.any(Date)
      );
    });

    it('sends NOTHING on a repeat signup', async () => {
      // This endpoint is public and unauthenticated — emailing on every call
      // would let anyone mailbomb an address by replaying the same signup.
      mocks.waitlistAdd.mockResolvedValue({
        created: false,
        entry: { sectionId: 'sec-1', email: 'jamie@example.com' },
      });

      const result = (await run(validEntry)) as { added: boolean };

      expect(result.added).toBe(false);
      expect(mocks.queueMail).not.toHaveBeenCalled();
      expect(mocks.markSignupEmailSent).not.toHaveBeenCalled();
    });

    it('handles the email-only capture with empty merge fields', async () => {
      mocks.waitlistAdd.mockResolvedValue({
        created: true,
        entry: {
          sectionId: 'sec-1',
          email: 'jamie@example.com',
          name: undefined,
          availability: undefined,
          createdAt: new Date(),
        },
      });

      await run({ sectionId: 'sec-1', email: 'jamie@example.com' });

      const mail = mocks.queueMail.mock.calls[0][0];
      expect(mail.data.name).toBe('');
      expect(mail.data.availability).toBe('');
    });

    it('does not stamp when queueMail declines the recipient', async () => {
      mocks.queueMail.mockResolvedValue(false);

      await run(validEntry);

      expect(mocks.markSignupEmailSent).not.toHaveBeenCalled();
    });

    it('still reports the signup when queuing mail throws', async () => {
      // The family's place in line is already committed — a mail failure must
      // never surface as "your signup didn't take".
      mocks.queueMail.mockRejectedValue(new Error('firestore unavailable'));

      const result = (await run(validEntry)) as { added: boolean };

      expect(result.added).toBe(true);
      expect(mocks.markSignupEmailSent).not.toHaveBeenCalled();
    });
  });
});
