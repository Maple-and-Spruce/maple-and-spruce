import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  runUnderMinimumAlerts: vi.fn(),
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
  RegistrationRepository: {},
  getDb: vi.fn(),
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
