import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  findBySectionId: vi.fn(),
  markReminderSentForSession: vi.fn(),
  mailAdd: vi.fn(),
}));

vi.mock('firebase-admin', () => {
  const admin = {
    apps: [{}], // non-empty → initializeApp not called
    initializeApp: vi.fn(),
    firestore: () => ({ collection: () => ({ add: mocks.mailAdd }) }),
  };
  return { default: admin, ...admin };
});

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: vi.fn((_config, handler) => handler),
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: { requiringRole: () => ({ handle: (fn: unknown) => fn }) },
  },
  Role: { Admin: 'admin' },
  isE2ETestEmail: (email: string) => email.endsWith('.test'),
  familyCalendarSubscribeUrl: (token: string) =>
    `webcal://host/calendar/family/${token}.ics`,
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findAll: mocks.findAll },
  MusicTogetherRegistrationRepository: {
    findBySectionId: mocks.findBySectionId,
    markReminderSentForSession: mocks.markReminderSentForSession,
  },
}));

import { runSendMusicTogetherReminders } from './send-music-together-reminders';

// 2026-07-15: session at 10am ET, "now" the same morning → session is in
// today's ET window.
const NOW = new Date('2026-07-15T15:00:00Z');
const SESSION_AT = new Date('2026-07-15T14:00:00Z');
const SESSION_ISO = SESSION_AT.toISOString();

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
    email: 'jamie@example.com',
    calendarToken: 'fam-token',
    reminderSentForSessions: undefined,
    ...overrides,
  };
}

describe('runSendMusicTogetherReminders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues one reminder per confirmed family with the subscribe link', async () => {
    mocks.findAll.mockResolvedValue([section()]);
    mocks.findBySectionId.mockResolvedValue([reg()]);

    const result = await runSendMusicTogetherReminders(NOW);

    expect(result.mailQueued).toBe(1);
    expect(result.sectionsWithSessionToday).toBe(1);
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
    const mail = mocks.mailAdd.mock.calls[0][0];
    expect(mail.to).toBe('jamie@example.com');
    expect(mail.template.name).toBe('music-together-reminder');
    expect(mail.template.data.sectionName).toBe('Tuesdays 10am — Mixed Age');
    expect(mail.template.data.calendarSubscribeUrl).toBe(
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
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('skips non-confirmed registrations', async () => {
    mocks.findAll.mockResolvedValue([section()]);
    mocks.findBySectionId.mockResolvedValue([reg({ status: 'pending' })]);

    const result = await runSendMusicTogetherReminders(NOW);

    expect(result.mailQueued).toBe(0);
    expect(result.skippedNotConfirmed).toBe(1);
  });

  it('skips E2E test emails without marking them sent', async () => {
    mocks.findAll.mockResolvedValue([section()]);
    mocks.findBySectionId.mockResolvedValue([
      reg({ email: 'someone@example.test' }),
    ]);

    const result = await runSendMusicTogetherReminders(NOW);

    expect(result.mailQueued).toBe(0);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
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
    mocks.findBySectionId.mockResolvedValue([
      reg({ calendarToken: undefined }),
    ]);

    await runSendMusicTogetherReminders(NOW);

    const mail = mocks.mailAdd.mock.calls[0][0];
    expect(mail.template.data.calendarSubscribeUrl).toBeUndefined();
  });
});
