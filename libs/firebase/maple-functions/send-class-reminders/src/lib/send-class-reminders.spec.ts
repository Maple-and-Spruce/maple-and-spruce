import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  runUnderMinimumAlerts: vi.fn(),
  findByClassId: vi.fn(),
  markReminderSentForSession: vi.fn(),
  mailAdd: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: vi.fn() }));
vi.mock('firebase-functions/params', () => ({
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));
vi.mock('@maple/firebase/functions', () => ({ isE2ETestEmail: () => false }));
vi.mock('@maple/firebase/database', () => ({
  ClassRepository: { findAll: mocks.findAll },
  InstructorRepository: { findById: vi.fn() },
  RegistrationRepository: {
    findByClassId: mocks.findByClassId,
    markReminderSentForSession: mocks.markReminderSentForSession,
  },
  getDb: () => ({ collection: () => ({ add: mocks.mailAdd }) }),
}));
vi.mock('./under-minimum-alert', () => ({
  runUnderMinimumAlerts: mocks.runUnderMinimumAlerts,
}));

import { runSendClassReminders } from './send-class-reminders';

const NOW = new Date('2026-09-29T12:00:00.000Z');

describe('runSendClassReminders: under-minimum check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockResolvedValue([]);
  });

  it('runs the check against the published classes and reports it', async () => {
    const counts = {
      classesChecked: 1,
      alertsSent: 1,
      skippedMinimumMet: 0,
      skippedAlreadyAlerted: 0,
    };
    mocks.runUnderMinimumAlerts.mockResolvedValue(counts);

    const result = await runSendClassReminders(NOW);

    expect(mocks.findAll).toHaveBeenCalledWith({ status: 'published' });
    expect(mocks.runUnderMinimumAlerts).toHaveBeenCalledWith([], NOW);
    expect(result.underMinimum).toEqual(counts);
  });

  it('never lets a failed check stop the reminders', async () => {
    mocks.runUnderMinimumAlerts.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await runSendClassReminders(NOW);

    expect(result.mailQueued).toBe(0);
    expect(result.underMinimum.alertsSent).toBe(0);
  });
});

describe('runSendClassReminders: private hours', () => {
  // Saturday 2030-06-15, 8 AM Eastern: the scheduled run.
  const RUN_AT = new Date('2030-06-15T12:00:00.000Z');
  const HOUR_10 = new Date('2030-06-15T14:00:00.000Z'); // 10:00 AM ET today
  const HOUR_12 = new Date('2030-06-15T16:00:00.000Z'); // 12:00 PM ET today
  const TOMORROW_10 = new Date('2030-06-16T14:00:00.000Z');

  const baseClass = {
    name: 'Private Pottery Hour',
    description: 'Your group, our studio.',
    durationMinutes: 60,
    capacity: 8,
    priceCents: 6000,
    skillLevel: 'all-levels',
    status: 'published',
    createdAt: new Date('2030-01-01'),
    updatedAt: new Date('2030-01-01'),
  };

  const privateClass = {
    ...baseClass,
    id: 'class-ph',
    format: 'privateHours',
    sessions: [
      { dateTime: HOUR_10 },
      { dateTime: HOUR_12 },
      { dateTime: TOMORROW_10 },
    ],
  };

  const reg = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    classId: 'class-ph',
    customerName: `Host ${id}`,
    customerEmail: `${id}@example.com`,
    quantity: 1,
    status: 'confirmed',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runUnderMinimumAlerts.mockResolvedValue({
      classesChecked: 0,
      alertsSent: 0,
      skippedMinimumMet: 0,
      skippedAlreadyAlerted: 0,
    });
  });

  const sentTo = (email: string) =>
    mocks.mailAdd.mock.calls
      .map(([doc]) => doc)
      .filter((doc) => doc.to === email);

  it('reminds each group about its own hour, once, and only on that day', async () => {
    mocks.findAll.mockResolvedValue([privateClass]);
    mocks.findByClassId.mockResolvedValue([
      reg('reg-a', { slotStart: HOUR_10 }),
      reg('reg-b', { slotStart: HOUR_12 }),
      reg('reg-c', { slotStart: TOMORROW_10 }),
    ]);

    const result = await runSendClassReminders(RUN_AT);

    expect(result.mailQueued).toBe(2);
    const [a] = sentTo('reg-a@example.com');
    const [b] = sentTo('reg-b@example.com');
    expect(sentTo('reg-a@example.com')).toHaveLength(1);
    expect(sentTo('reg-b@example.com')).toHaveLength(1);
    expect(sentTo('reg-c@example.com')).toHaveLength(0);
    expect(a.template.data.classStartTime).toBe('10:00 AM');
    expect(b.template.data.classStartTime).toBe('12:00 PM');
    expect(a.template.data.classDate).toBe('Saturday, June 15');

    expect(mocks.markReminderSentForSession).toHaveBeenCalledTimes(2);
    expect(mocks.markReminderSentForSession).toHaveBeenCalledWith(
      'reg-a',
      HOUR_10.toISOString(),
      RUN_AT
    );
    expect(mocks.markReminderSentForSession).toHaveBeenCalledWith(
      'reg-b',
      HOUR_12.toISOString(),
      RUN_AT
    );
  });

  it("skips a group already reminded for its own hour", async () => {
    mocks.findAll.mockResolvedValue([privateClass]);
    mocks.findByClassId.mockResolvedValue([
      reg('reg-a', {
        slotStart: HOUR_10,
        reminderSentForSessions: { [HOUR_10.toISOString()]: RUN_AT },
      }),
      reg('reg-b', { slotStart: HOUR_12 }),
    ]);

    const result = await runSendClassReminders(RUN_AT);

    expect(result.mailQueued).toBe(1);
    expect(result.skippedAlreadySent).toBe(1);
    expect(sentTo('reg-a@example.com')).toHaveLength(0);
  });

  it("leaves seat classes reminding everyone about today's session", async () => {
    const seatClass = {
      ...baseClass,
      id: 'class-seats',
      name: 'Wheel Throwing',
      sessions: [{ dateTime: HOUR_12 }, { dateTime: TOMORROW_10 }],
    };
    mocks.findAll.mockResolvedValue([seatClass]);
    mocks.findByClassId.mockResolvedValue([
      reg('seat-a', { classId: 'class-seats', quantity: 2 }),
      reg('seat-b', { classId: 'class-seats' }),
    ]);

    const result = await runSendClassReminders(RUN_AT);

    expect(result.mailQueued).toBe(2);
    for (const email of ['seat-a@example.com', 'seat-b@example.com']) {
      const [doc] = sentTo(email);
      expect(doc.template.data.classStartTime).toBe('12:00 PM');
    }
    expect(mocks.markReminderSentForSession).toHaveBeenCalledWith(
      'seat-a',
      HOUR_12.toISOString(),
      RUN_AT
    );
  });
});
