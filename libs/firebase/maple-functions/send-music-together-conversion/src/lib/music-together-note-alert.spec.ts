import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Staff email for a family's accommodations (#327). All people are invented. */
const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
  findSection: vi.fn(),
  mailAdd: vi.fn(),
}));

vi.mock('firebase-functions/params', () => ({
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherRegistrationRepository: {
    claimNoteAlert: mocks.claim,
    releaseNoteAlert: mocks.release,
  },
  MusicTogetherSectionRepository: { findById: mocks.findSection },
  getDb: () => ({ collection: vi.fn(() => ({ add: mocks.mailAdd })) }),
}));

import {
  alertStaffOfAccommodationsIfConfirmed,
  buildMusicTogetherNoteAlert,
  shouldAlertAccommodations,
  type MusicTogetherNoteAlertData,
} from './music-together-note-alert';

const NOW = new Date('2026-11-08T15:00:00Z');
const quiet = { log: vi.fn(), error: vi.fn() };

const confirmed = (over: Partial<MusicTogetherNoteAlertData> = {}): MusicTogetherNoteAlertData => ({
  status: 'confirmed',
  sectionId: 'sec-tue',
  adultFirstName: 'Fern',
  adultLastName: 'Calder',
  accommodations: 'Peanut allergy',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claim.mockResolvedValue(true);
  mocks.release.mockResolvedValue(undefined);
  mocks.mailAdd.mockResolvedValue(undefined);
  mocks.findSection.mockResolvedValue({ name: 'Fall · Tuesdays 10am' });
});

describe('shouldAlertAccommodations', () => {
  it('fires on the transition to confirmed with accommodations', () => {
    expect(shouldAlertAccommodations({ status: 'pending' }, confirmed())).toBe(true);
  });

  it('skips blank accommodations, later edits and stamped registrations', () => {
    expect(shouldAlertAccommodations({ status: 'pending' }, confirmed({ accommodations: ' ' }))).toBe(false);
    expect(shouldAlertAccommodations({ status: 'pending' }, confirmed({ accommodations: null }))).toBe(false);
    expect(shouldAlertAccommodations(confirmed(), confirmed())).toBe(false);
    expect(shouldAlertAccommodations({ status: 'pending' }, confirmed({ noteAlertSentAt: NOW }))).toBe(false);
    expect(shouldAlertAccommodations({ status: 'pending' }, confirmed({ status: 'pending' }))).toBe(false);
  });
});

describe('buildMusicTogetherNoteAlert', () => {
  it('names the family and section, and escapes HTML', () => {
    const email = buildMusicTogetherNoteAlert({
      data: confirmed({ accommodations: 'Uses <AAC> device' }),
      sectionName: 'Fall · Tuesdays 10am',
      portalUrl: 'https://portal.example.com',
    });
    expect(email.subject).toBe(
      'Accommodations on a Music Together registration: Fall · Tuesdays 10am'
    );
    expect(email.text).toContain('Fern Calder listed accommodations');
    expect(email.text).toContain('https://portal.example.com/music-together');
    expect(email.html).toContain('Uses &lt;AAC&gt; device');
  });

  it('falls back when the names or section are missing', () => {
    const email = buildMusicTogetherNoteAlert({
      data: confirmed({ adultFirstName: '', adultLastName: undefined }),
      portalUrl: 'https://portal.example.com',
    });
    expect(email.text).toContain('A family listed accommodations');
    expect(email.subject).toBe('Accommodations on a Music Together registration: Music Together');
  });
});

describe('alertStaffOfAccommodationsIfConfirmed', () => {
  it('claims and queues one email to staff', async () => {
    await expect(
      alertStaffOfAccommodationsIfConfirmed('mtr-1', { status: 'pending' }, confirmed(), NOW, quiet)
    ).resolves.toBe(true);
    expect(mocks.claim).toHaveBeenCalledWith('mtr-1', NOW);
    expect(mocks.mailAdd).toHaveBeenCalledWith({
      to: 'mock-ADMIN_ALERT_EMAIL',
      message: expect.objectContaining({
        subject: 'Accommodations on a Music Together registration: Fall · Tuesdays 10am',
      }),
    });
  });

  it('sends nothing when already claimed', async () => {
    mocks.claim.mockResolvedValue(false);
    await alertStaffOfAccommodationsIfConfirmed('mtr-1', { status: 'pending' }, confirmed(), NOW, quiet);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('never throws, and gives the claim back when queuing fails', async () => {
    mocks.mailAdd.mockRejectedValue(new Error('boom'));
    await expect(
      alertStaffOfAccommodationsIfConfirmed('mtr-1', { status: 'pending' }, confirmed(), NOW, quiet)
    ).resolves.toBe(false);
    expect(mocks.release).toHaveBeenCalledWith('mtr-1');
  });
});
