import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  findBySectionId: vi.fn(),
  markReminderSentForSession: vi.fn(),
  findUpcomingVisible: vi.fn(),
  findByDemoId: vi.fn(),
  markDemoReminderSent: vi.fn(),
  queueMail: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}], // non-empty → initializeApp not called
  initializeApp: vi.fn(),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: vi.fn((_config, handler) => handler),
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: { requiringRole: () => ({ handle: (fn: unknown) => fn }) },
  },
  Role: { Admin: 'admin' },
  queueMail: mocks.queueMail,
  familyCalendarSubscribeUrl: (token: string) =>
    `webcal://host/calendar/family/${token}.ics`,
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findAll: mocks.findAll },
  MusicTogetherRegistrationRepository: {
    findBySectionId: mocks.findBySectionId,
    markReminderSentForSession: mocks.markReminderSentForSession,
  },
  MusicTogetherDemoRepository: {
    findUpcomingVisible: mocks.findUpcomingVisible,
  },
  MusicTogetherDemoRsvpRepository: {
    findByDemoId: mocks.findByDemoId,
    markReminderSent: mocks.markDemoReminderSent,
  },
}));

import { runSendMusicTogetherReminders } from './send-music-together-reminders';

// 2026-07-15: session at 10am ET, "now" the same morning → session is in
// today's ET window.
const NOW = new Date('2026-07-15T15:00:00Z');
const SESSION_AT = new Date('2026-07-15T14:00:00Z');
const SESSION_ISO = SESSION_AT.toISOString();
/** 2026-07-22 10am ET — one week out from NOW. */
const IN_7_DAYS = new Date('2026-07-22T14:00:00Z');
/** 2026-07-17 10am ET — two days out from NOW. */
const IN_2_DAYS = new Date('2026-07-17T14:00:00Z');

function section(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sec-1',
    name: 'Tuesdays 10am — Mixed Age',
    sessions: [{ dateTime: SESSION_AT }],
    visible: true,
    location: 'Spruce Room',
    ...overrides,
  };
}

function reg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    status: 'confirmed',
    parentNames: ['Jamie'],
    children: [{ name: 'Ada', dob: new Date('2024-01-01') }],
    email: 'jamie@example.com',
    calendarToken: 'fam-token',
    reminderSentForSessions: undefined,
    ...overrides,
  };
}

function demo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demo-1',
    dateTime: IN_7_DAYS,
    location: 'Morgantown Public Library',
    visible: true,
    capacityFamilies: 8,
    ...overrides,
  };
}

function rsvp(overrides: Record<string, unknown> = {}) {
  return {
    id: 'kai@example.com',
    demoId: 'demo-1',
    name: 'Kai',
    email: 'kai@example.com',
    status: 'confirmed',
    createdAt: NOW,
    ...overrides,
  };
}

/** The template data of the nth queued mail. */
function mailAt(n: number) {
  return mocks.queueMail.mock.calls[n][0];
}

describe('runSendMusicTogetherReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: nothing scheduled anywhere. Each test opts into its own pass.
    mocks.findAll.mockResolvedValue([]);
    mocks.findBySectionId.mockResolvedValue([]);
    mocks.findUpcomingVisible.mockResolvedValue([]);
    mocks.findByDemoId.mockResolvedValue([]);
    mocks.queueMail.mockResolvedValue(true);
  });

  describe('pass A — sections meeting today', () => {
    it('queues one reminder per confirmed family with the subscribe link', async () => {
      mocks.findAll.mockResolvedValue([section()]);
      mocks.findBySectionId.mockResolvedValue([reg()]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(1);
      expect(result.sectionsWithSessionToday).toBe(1);
      expect(mocks.queueMail).toHaveBeenCalledTimes(1);
      const mail = mailAt(0);
      expect(mail.to).toBe('jamie@example.com');
      expect(mail.templateName).toBe('music-together-reminder');
      expect(mail.sender).toBe('music-together');
      expect(mail.data.sectionName).toBe('Tuesdays 10am — Mixed Age');
      expect(mail.data.caregiverName).toBe('Jamie');
      expect(mail.data.childNames).toBe('Ada');
      expect(mail.data.calendarSubscribeUrl).toBe(
        'webcal://host/calendar/family/fam-token.ics'
      );
      expect(mocks.markReminderSentForSession).toHaveBeenCalledWith(
        'reg-1',
        SESSION_ISO,
        NOW
      );
    });

    it('is idempotent — skips a family already reminded for the session', async () => {
      mocks.findAll.mockResolvedValue([section()]);
      mocks.findBySectionId.mockResolvedValue([
        reg({ reminderSentForSessions: { [SESSION_ISO]: new Date() } }),
      ]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(0);
      expect(result.skippedAlreadySent).toBe(1);
      expect(mocks.queueMail).not.toHaveBeenCalled();
    });

    it('skips non-confirmed registrations', async () => {
      mocks.findAll.mockResolvedValue([section()]);
      mocks.findBySectionId.mockResolvedValue([reg({ status: 'pending' })]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(0);
      expect(result.skippedNotConfirmed).toBe(1);
    });

    it('does not mark a send that queueMail declined (E2E recipient)', async () => {
      mocks.findAll.mockResolvedValue([section()]);
      mocks.findBySectionId.mockResolvedValue([
        reg({ email: 'someone@maplespruce.test' }),
      ]);
      mocks.queueMail.mockResolvedValue(false);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(0);
      expect(mocks.markReminderSentForSession).not.toHaveBeenCalled();
    });

    it('ignores hidden (draft) sections and sections with no session today', async () => {
      mocks.findAll.mockResolvedValue([
        section({ id: 'draft', visible: false }),
        section({
          id: 'other-day',
          sessions: [{ dateTime: new Date('2026-07-20T14:00:00Z') }],
        }),
      ]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.sectionsWithSessionToday).toBe(0);
      expect(result.mailQueued).toBe(0);
      expect(mocks.findBySectionId).not.toHaveBeenCalled();
    });

    it('omits the subscribe link when the family has no token', async () => {
      mocks.findAll.mockResolvedValue([section()]);
      mocks.findBySectionId.mockResolvedValue([reg({ calendarToken: undefined })]);

      await runSendMusicTogetherReminders(NOW);

      expect(mailAt(0).data.calendarSubscribeUrl).toBeUndefined();
    });
  });

  describe('passes B & C — first class approaching', () => {
    it('queues the one-week email when the first session is 7 days out', async () => {
      mocks.findAll.mockResolvedValue([
        section({ sessions: [{ dateTime: IN_7_DAYS }] }),
      ]);
      mocks.findBySectionId.mockResolvedValue([reg()]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(1);
      expect(result.sectionsWithSessionToday).toBe(0);
      expect(mailAt(0).templateName).toBe('music-together-first-class-7d');
      expect(mailAt(0).data.childNames).toBe('Ada');
      // Prefixed stamp key so it can't collide with the day-of send for the
      // same session.
      expect(mocks.markReminderSentForSession).toHaveBeenCalledWith(
        'reg-1',
        `pre7:${IN_7_DAYS.toISOString()}`,
        NOW
      );
    });

    it('queues the two-day email when the first session is 2 days out', async () => {
      mocks.findAll.mockResolvedValue([
        section({ sessions: [{ dateTime: IN_2_DAYS }] }),
      ]);
      mocks.findBySectionId.mockResolvedValue([reg()]);

      await runSendMusicTogetherReminders(NOW);

      expect(mailAt(0).templateName).toBe('music-together-first-class-48h');
      expect(mocks.markReminderSentForSession).toHaveBeenCalledWith(
        'reg-1',
        `pre48:${IN_2_DAYS.toISOString()}`,
        NOW
      );
    });

    it('only counts the FIRST session — a mid-term week 7 days out sends nothing', async () => {
      mocks.findAll.mockResolvedValue([
        section({
          // Term already started; a later session happens to fall 7 days out.
          sessions: [
            { dateTime: new Date('2026-06-10T14:00:00Z') },
            { dateTime: IN_7_DAYS },
          ],
        }),
      ]);
      mocks.findBySectionId.mockResolvedValue([reg()]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(0);
      expect(result.sectionsWithUpcomingFirstClass).toBe(0);
    });

    it('is idempotent on the prefixed key', async () => {
      mocks.findAll.mockResolvedValue([
        section({ sessions: [{ dateTime: IN_7_DAYS }] }),
      ]);
      mocks.findBySectionId.mockResolvedValue([
        reg({
          reminderSentForSessions: {
            [`pre7:${IN_7_DAYS.toISOString()}`]: new Date(),
          },
        }),
      ]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(0);
      expect(result.skippedAlreadySent).toBe(1);
    });
  });

  describe('passes D & E — demos approaching', () => {
    it('queues the one-week demo email with the demo\'s OWN location', async () => {
      mocks.findUpcomingVisible.mockImplementation(async (from: Date) =>
        from.getTime() <= IN_7_DAYS.getTime() &&
        from.getTime() > IN_2_DAYS.getTime()
          ? [demo()]
          : []
      );
      mocks.findByDemoId.mockResolvedValue([rsvp()]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(1);
      const mail = mailAt(0);
      expect(mail.templateName).toBe('music-together-demo-reminder-7d');
      expect(mail.to).toBe('kai@example.com');
      expect(mail.sender).toBe('music-together');
      // Demos are regularly offsite — never the studio address.
      expect(mail.data.demoLocation).toBe('Morgantown Public Library');
      expect(mocks.markDemoReminderSent).toHaveBeenCalledWith(
        'demo-1',
        'kai@example.com',
        '7d',
        NOW
      );
    });

    it('queues the two-day demo email (with the founding-family nudge)', async () => {
      mocks.findUpcomingVisible.mockImplementation(async (from: Date) =>
        from.getTime() <= IN_2_DAYS.getTime() ? [demo({ dateTime: IN_2_DAYS })] : []
      );
      mocks.findByDemoId.mockResolvedValue([rsvp()]);

      await runSendMusicTogetherReminders(NOW);

      expect(mailAt(0).templateName).toBe('music-together-demo-reminder-48h');
      expect(mocks.markDemoReminderSent).toHaveBeenCalledWith(
        'demo-1',
        'kai@example.com',
        '48h',
        NOW
      );
    });

    it('never reminds a waitlisted family — they have no seat to show up for', async () => {
      mocks.findUpcomingVisible.mockResolvedValue([demo()]);
      mocks.findByDemoId.mockResolvedValue([rsvp({ status: 'waitlisted' })]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(0);
      expect(mocks.queueMail).not.toHaveBeenCalled();
    });

    it('re-running the same day sends nothing more', async () => {
      mocks.findUpcomingVisible.mockResolvedValue([demo()]);
      mocks.findByDemoId.mockResolvedValue([
        rsvp({ reminder7dSentAt: new Date() }),
      ]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.skippedAlreadySent).toBe(1);
      expect(result.mailQueued).toBe(0);
    });

    it('the 48h send is independent of the 7d stamp', async () => {
      // Same family, five days later: the 7d email already went out, and the
      // demo is now two days away. The 48h stamp is still clear, so it sends.
      mocks.findUpcomingVisible.mockResolvedValue([demo({ dateTime: IN_2_DAYS })]);
      mocks.findByDemoId.mockResolvedValue([
        rsvp({ reminder7dSentAt: new Date() }),
      ]);

      const result = await runSendMusicTogetherReminders(NOW);

      expect(result.mailQueued).toBe(1);
      expect(mailAt(0).templateName).toBe('music-together-demo-reminder-48h');
      expect(mocks.markDemoReminderSent).toHaveBeenCalledWith(
        'demo-1',
        'kai@example.com',
        '48h',
        NOW
      );
    });
  });
});
