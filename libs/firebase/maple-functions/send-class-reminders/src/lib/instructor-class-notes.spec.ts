import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class, Registration } from '@maple/ts/domain';

/** Customer notes emailed to the instructor (#325). All people are invented. */
const mocks = vi.hoisted(() => ({
  findByClassId: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  instructorFindById: vi.fn(),
  mailAdd: vi.fn(),
}));

vi.mock('firebase-functions/params', () => ({
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

vi.mock('@maple/firebase/functions', () => ({
  isE2ETestEmail: (email: string) => email.endsWith('@e2e.example.com'),
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    claimInstructorNotesEmail: mocks.claim,
    releaseInstructorNotesEmail: mocks.release,
  },
  InstructorRepository: { findById: mocks.instructorFindById },
  RegistrationRepository: { findByClassId: mocks.findByClassId },
  getDb: () => ({ collection: vi.fn(() => ({ add: mocks.mailAdd })) }),
}));

import {
  buildInstructorNotesEmail,
  notedSeatHolders,
  runInstructorClassNotes,
  selectClassesForInstructorNotes,
} from './instructor-class-notes';

// 8:00 AM EDT Tuesday Sep 29; "tomorrow" is the ET day Wednesday Sep 30,
// i.e. [2026-09-30T04:00Z, 2026-10-01T03:59:59.999Z].
const NOW = new Date('2026-09-29T12:00:00.000Z');
const TOMORROW_2PM = new Date('2026-09-30T18:00:00.000Z');

function buildClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'class-1',
    name: 'Wreath Making',
    description: 'Make a wreath from foraged greens.',
    instructorId: 'instr-1',
    sessions: [{ dateTime: TOMORROW_2PM }],
    durationMinutes: 120,
    capacity: 10,
    priceCents: 6000,
    skillLevel: 'beginner',
    status: 'published',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

let seq = 0;
function reg(overrides: Partial<Registration> = {}): Registration {
  seq += 1;
  return {
    id: `reg-${seq}`,
    classId: 'class-1',
    customerName: 'Olive Thompson',
    customerEmail: 'olive@example.com',
    quantity: 1,
    pricePaidCents: 6360,
    subtotalCents: 6000,
    taxAmountCents: 360,
    taxRatePercent: 6,
    status: 'confirmed',
    source: 'web',
    createdAt: new Date(`2026-09-0${Math.min(seq, 9)}T12:00:00Z`),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  mocks.claim.mockResolvedValue(true);
  mocks.instructorFindById.mockResolvedValue({
    name: 'Robin Ashfield',
    email: 'robin@example.com',
  });
  mocks.mailAdd.mockResolvedValue(undefined);
});

describe('selectClassesForInstructorNotes', () => {
  const pick = (c: Class) => selectClassesForInstructorNotes([c], NOW).length === 1;

  it('picks a published class with an instructor whose first session is tomorrow', () => {
    expect(pick(buildClass())).toBe(true);
  });

  it('skips a class with no instructor, or not published', () => {
    expect(pick(buildClass({ instructorId: undefined }))).toBe(false);
    expect(pick(buildClass({ status: 'draft' }))).toBe(false);
    expect(pick(buildClass({ status: 'cancelled' }))).toBe(false);
  });

  it('looks at the FIRST session only', () => {
    // Started today; tomorrow is its second session.
    expect(
      pick(
        buildClass({
          sessions: [{ dateTime: TOMORROW_2PM }, { dateTime: new Date('2026-09-29T18:00:00Z') }],
        })
      )
    ).toBe(false);
  });

  it('covers both edges of tomorrow in ET and nothing either side', () => {
    const at = (iso: string) => pick(buildClass({ sessions: [{ dateTime: new Date(iso) }] }));
    expect(at('2026-09-30T04:00:00.000Z')).toBe(true);
    expect(at('2026-10-01T03:59:59.999Z')).toBe(true);
    expect(at('2026-09-30T03:59:59.999Z')).toBe(false);
    expect(at('2026-10-01T04:00:00.000Z')).toBe(false);
  });
});

describe('notedSeatHolders', () => {
  it('keeps confirmed and pending registrations with a note, oldest first', () => {
    const later = reg({ id: 'later', notes: 'Left-handed', createdAt: new Date('2026-09-20') });
    const earlier = reg({ id: 'earlier', notes: 'Peanut allergy', status: 'pending', createdAt: new Date('2026-09-10') });
    const kept = notedSeatHolders([
      later,
      reg({ notes: '   ' }),
      reg({ notes: undefined }),
      reg({ notes: 'Gone', status: 'cancelled' }),
      reg({ notes: 'Gone', status: 'refunded' }),
      reg({ notes: 'Gone', status: 'no-show' }),
      earlier,
    ]);
    expect(kept.map((r) => r.id)).toEqual(['earlier', 'later']);
  });
});

describe('buildInstructorNotesEmail', () => {
  it('greets by first name and lists each note with who left it', () => {
    const email = buildInstructorNotesEmail({
      classEntity: buildClass(),
      instructorName: 'Robin Ashfield',
      noted: [
        reg({ customerName: 'Olive Thompson', quantity: 2, notes: 'Peanut allergy' }),
        reg({ customerName: 'Wren Calloway', notes: 'Uses a wheelchair\nneeds the ramp' }),
      ],
    });
    expect(email.subject).toBe('Notes from your students: Wreath Making, tomorrow');
    expect(email.text).toContain('Hi Robin,');
    expect(email.text).toContain(
      '2 people coming to Wreath Making (Wednesday, September 30 at 2:00 PM) left a note'
    );
    expect(email.text).toContain('- Olive Thompson (2 spots): Peanut allergy');
    expect(email.text).toContain('- Wren Calloway: Uses a wheelchair\nneeds the ramp');
    expect(email.html).toContain('Uses a wheelchair<br>needs the ramp');
    expect(email.text).toContain('Reply to this email');
  });

  it('says "One person" for a single note and escapes HTML', () => {
    const email = buildInstructorNotesEmail({
      classEntity: buildClass({ name: 'Paint & Sip' }),
      noted: [reg({ notes: 'Bringing <my own> brushes' })],
    });
    expect(email.text).toContain('Hi,');
    expect(email.text).toContain('One person coming to Paint & Sip');
    expect(email.html).toContain('Bringing &lt;my own&gt; brushes');
    expect(email.html).toContain('Paint &amp; Sip');
  });

  it('names the hour on a private-hours booking', () => {
    const email = buildInstructorNotesEmail({
      classEntity: buildClass(),
      noted: [reg({ slotStart: TOMORROW_2PM, groupSize: 6, notes: 'Birthday party' })],
    });
    expect(email.text).toMatch(/- Olive Thompson \(.*2:00.*\): Birthday party/);
  });
});

describe('runInstructorClassNotes', () => {
  it('emails the instructor once, replying to the studio', async () => {
    mocks.findByClassId.mockResolvedValue([reg({ notes: 'Peanut allergy' })]);

    const result = await runInstructorClassNotes([buildClass()], NOW);

    expect(result).toEqual({
      classesChecked: 1,
      emailsSent: 1,
      skippedNoNotes: 0,
      skippedNoEmail: 0,
      skippedAlreadySent: 0,
    });
    expect(mocks.claim).toHaveBeenCalledWith('class-1', NOW);
    expect(mocks.mailAdd).toHaveBeenCalledWith({
      to: 'robin@example.com',
      replyTo: 'mock-ADMIN_ALERT_EMAIL',
      message: expect.objectContaining({
        subject: 'Notes from your students: Wreath Making, tomorrow',
      }),
    });
  });

  it('sends nothing, and claims nothing, when there are no notes', async () => {
    mocks.findByClassId.mockResolvedValue([reg(), reg({ notes: 'x', status: 'cancelled' })]);
    const result = await runInstructorClassNotes([buildClass()], NOW);
    expect(result.skippedNoNotes).toBe(1);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('skips an instructor with no email, or a test address', async () => {
    mocks.findByClassId.mockResolvedValue([reg({ notes: 'Peanut allergy' })]);
    mocks.instructorFindById.mockResolvedValueOnce({ name: 'Robin Ashfield' });
    mocks.instructorFindById.mockResolvedValueOnce({ name: 'Test', email: 'x@e2e.example.com' });
    const result = await runInstructorClassNotes(
      [buildClass({ id: 'a' }), buildClass({ id: 'b' })],
      NOW
    );
    expect(result.skippedNoEmail).toBe(2);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('skips a class already emailed, by its stamp or by losing the claim', async () => {
    mocks.findByClassId.mockResolvedValue([reg({ notes: 'Peanut allergy' })]);
    mocks.claim.mockResolvedValueOnce(false);
    const result = await runInstructorClassNotes(
      [buildClass({ id: 'stamped', instructorNotesSentAt: NOW }), buildClass({ id: 'raced' })],
      NOW
    );
    expect(result.skippedAlreadySent).toBe(2);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('gives the claim back when queuing fails, and carries on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.findByClassId.mockResolvedValue([reg({ notes: 'Peanut allergy' })]);
    mocks.mailAdd.mockRejectedValueOnce(new Error('boom'));
    const result = await runInstructorClassNotes(
      [buildClass({ id: 'fails' }), buildClass({ id: 'works' })],
      NOW
    );
    expect(mocks.release).toHaveBeenCalledWith('fails');
    expect(result.emailsSent).toBe(1);
  });
});
