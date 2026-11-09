import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Staff email for a customer's note (#327). All people are invented. */
const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
  findClass: vi.fn(),
  mailAdd: vi.fn(),
}));

vi.mock('firebase-functions/params', () => ({
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

vi.mock('@maple/firebase/database', () => ({
  RegistrationRepository: { claimNoteAlert: mocks.claim, releaseNoteAlert: mocks.release },
  ClassRepository: { findById: mocks.findClass },
  getDb: () => ({ collection: vi.fn(() => ({ add: mocks.mailAdd })) }),
}));

import {
  alertStaffOfNoteIfConfirmed,
  buildRegistrationNoteAlert,
  shouldAlertNote,
  type NoteAlertRegistrationData,
} from './registration-note-alert';

const NOW = new Date('2026-11-08T15:00:00Z');
const quiet = { log: vi.fn(), error: vi.fn() };

const confirmed = (over: Partial<NoteAlertRegistrationData> = {}): NoteAlertRegistrationData => ({
  status: 'confirmed',
  classId: 'cls-wreath',
  customerName: 'Olive Thompson',
  quantity: 1,
  notes: 'Peanut allergy',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claim.mockResolvedValue(true);
  mocks.release.mockResolvedValue(undefined);
  mocks.mailAdd.mockResolvedValue(undefined);
  mocks.findClass.mockResolvedValue({
    name: 'Wreath Making',
    sessions: [
      { dateTime: new Date('2026-12-05T19:00:00Z') },
      { dateTime: new Date('2026-12-04T19:00:00Z') },
    ],
  });
});

describe('shouldAlertNote', () => {
  it('fires on the pending -> confirmed transition with a note', () => {
    expect(shouldAlertNote({ status: 'pending' }, confirmed())).toBe(true);
    expect(shouldAlertNote(undefined, confirmed())).toBe(true);
  });

  it('does not fire without a note, or for a blank one', () => {
    expect(shouldAlertNote({ status: 'pending' }, confirmed({ notes: undefined }))).toBe(false);
    expect(shouldAlertNote({ status: 'pending' }, confirmed({ notes: ' \n ' }))).toBe(false);
  });

  it('does not fire on later edits, other statuses, or once stamped', () => {
    expect(shouldAlertNote(confirmed(), confirmed())).toBe(false);
    expect(shouldAlertNote({ status: 'pending' }, confirmed({ status: 'pending' }))).toBe(false);
    expect(shouldAlertNote({ status: 'pending' }, confirmed({ status: 'cancelled' }))).toBe(false);
    expect(shouldAlertNote({ status: 'pending' }, confirmed({ noteAlertSentAt: NOW }))).toBe(false);
    expect(shouldAlertNote({ status: 'pending' }, undefined)).toBe(false);
  });
});

describe('buildRegistrationNoteAlert', () => {
  it('leads with the note and links to the registration on its roster', () => {
    const email = buildRegistrationNoteAlert({
      registrationId: 'reg-1',
      data: confirmed({ quantity: 2, notes: 'Peanut allergy\nand <latex>' }),
      className: 'Wreath Making',
      firstSessionAt: new Date('2026-12-04T19:00:00Z'),
      portalUrl: 'https://portal.example.com/',
    });
    expect(email.subject).toBe('Note on a registration: Wreath Making');
    expect(email.text).toContain('Olive Thompson left a note when they registered:\n\nPeanut allergy\nand <latex>');
    expect(email.text).toContain('Starts: Fri, Dec 4 at 2:00 PM');
    expect(email.text).toContain('Who: Olive Thompson (2 spots)');
    expect(email.text).toContain(
      'https://portal.example.com/classes/cls-wreath/roster?registration=reg-1'
    );
    expect(email.html).toContain('Peanut allergy<br>and &lt;latex&gt;');
  });

  it('copes with a class it could not load', () => {
    const email = buildRegistrationNoteAlert({
      registrationId: 'reg-1',
      data: confirmed({ customerName: '' }),
      portalUrl: 'https://portal.example.com',
    });
    expect(email.subject).toBe('Note on a registration: a class');
    expect(email.text).toContain('A customer left a note');
    expect(email.text).toContain('Class: Unknown class');
    expect(email.text).not.toContain('Starts:');
  });
});

describe('alertStaffOfNoteIfConfirmed', () => {
  it('claims, then queues one email to staff with the class and first session', async () => {
    await expect(
      alertStaffOfNoteIfConfirmed('reg-1', { status: 'pending' }, confirmed(), NOW, quiet)
    ).resolves.toBe(true);
    expect(mocks.claim).toHaveBeenCalledWith('reg-1', NOW);
    expect(mocks.findClass).toHaveBeenCalledWith('cls-wreath');
    expect(mocks.mailAdd).toHaveBeenCalledWith({
      to: 'mock-ADMIN_ALERT_EMAIL',
      message: expect.objectContaining({
        subject: 'Note on a registration: Wreath Making',
        text: expect.stringContaining('Starts: Fri, Dec 4 at 2:00 PM'),
      }),
    });
  });

  it('does nothing when the write does not qualify', async () => {
    await expect(
      alertStaffOfNoteIfConfirmed('reg-1', confirmed(), confirmed(), NOW, quiet)
    ).resolves.toBe(false);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('sends nothing when another delivery already claimed it', async () => {
    mocks.claim.mockResolvedValue(false);
    await expect(
      alertStaffOfNoteIfConfirmed('reg-1', { status: 'pending' }, confirmed(), NOW, quiet)
    ).resolves.toBe(false);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('still emails when the class lookup fails', async () => {
    mocks.findClass.mockRejectedValue(new Error('down'));
    await expect(
      alertStaffOfNoteIfConfirmed('reg-1', { status: 'pending' }, confirmed(), NOW, quiet)
    ).resolves.toBe(true);
    expect(mocks.mailAdd).toHaveBeenCalled();
  });

  it('never throws, and gives the claim back when queuing fails', async () => {
    mocks.mailAdd.mockRejectedValue(new Error('boom'));
    await expect(
      alertStaffOfNoteIfConfirmed('reg-1', { status: 'pending' }, confirmed(), NOW, quiet)
    ).resolves.toBe(false);
    expect(mocks.release).toHaveBeenCalledWith('reg-1');
    expect(quiet.error).toHaveBeenCalled();
  });

  it('never throws when the claim itself fails, and releases nothing', async () => {
    mocks.claim.mockRejectedValue(new Error('contention'));
    await expect(
      alertStaffOfNoteIfConfirmed('reg-1', { status: 'pending' }, confirmed(), NOW, quiet)
    ).resolves.toBe(false);
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
