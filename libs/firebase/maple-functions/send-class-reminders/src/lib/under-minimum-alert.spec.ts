import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  countByClassId: vi.fn(),
  claimUnderMinimumAlert: vi.fn(),
  releaseUnderMinimumAlert: vi.fn(),
  instructorFindById: vi.fn(),
  mailAdd: vi.fn(),
}));

vi.mock('firebase-functions/params', () => ({
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    claimUnderMinimumAlert: mocks.claimUnderMinimumAlert,
    releaseUnderMinimumAlert: mocks.releaseUnderMinimumAlert,
  },
  InstructorRepository: { findById: mocks.instructorFindById },
  RegistrationRepository: { countByClassId: mocks.countByClassId },
  getDb: () => ({ collection: vi.fn(() => ({ add: mocks.mailAdd })) }),
}));

import {
  buildUnderMinimumAlert,
  runUnderMinimumAlerts,
  selectClassesForMinimumCheck,
} from './under-minimum-alert';

// 8:00 AM EDT Tuesday Sep 29; "a week out" is the ET day Tuesday Oct 6,
// i.e. [2026-10-06T04:00Z, 2026-10-07T03:59:59.999Z].
const NOW = new Date('2026-09-29T12:00:00.000Z');
const WEEK_OUT_2PM = new Date('2026-10-06T18:00:00.000Z');

function buildClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'class-1',
    name: 'Beginner Block Printing',
    description: 'Carve and print your own linocut block.',
    instructorId: 'instr-1',
    sessions: [{ dateTime: WEEK_OUT_2PM }],
    durationMinutes: 120,
    capacity: 10,
    priceCents: 6000,
    skillLevel: 'beginner',
    status: 'published',
    minimumEnrollment: 4,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimUnderMinimumAlert.mockResolvedValue(true);
  mocks.instructorFindById.mockResolvedValue({ name: 'Robin Ashfield' });
  mocks.mailAdd.mockResolvedValue(undefined);
});

describe('selectClassesForMinimumCheck', () => {
  const pick = (c: Class) => selectClassesForMinimumCheck([c], NOW).length === 1;

  it('picks a published class with a minimum whose first session is a week out', () => {
    expect(pick(buildClass())).toBe(true);
  });

  it('skips a class with no minimum set', () => {
    expect(pick(buildClass({ minimumEnrollment: undefined }))).toBe(false);
    expect(pick(buildClass({ minimumEnrollment: null }))).toBe(false);
    expect(pick(buildClass({ minimumEnrollment: 0 }))).toBe(false);
  });

  it('skips cancelled and draft classes', () => {
    expect(pick(buildClass({ status: 'cancelled' }))).toBe(false);
    expect(pick(buildClass({ status: 'draft' }))).toBe(false);
  });

  it('includes both edges of the ET day a week out', () => {
    const at = (iso: string) => buildClass({ sessions: [{ dateTime: new Date(iso) }] });
    // 00:00 EDT Oct 6
    expect(pick(at('2026-10-06T04:00:00.000Z'))).toBe(true);
    // 23:59:59 EDT Oct 6
    expect(pick(at('2026-10-07T03:59:59.999Z'))).toBe(true);
  });

  it('excludes the days either side of it', () => {
    const at = (iso: string) => buildClass({ sessions: [{ dateTime: new Date(iso) }] });
    // 23:59 EDT Oct 5 (six days out)
    expect(pick(at('2026-10-06T03:59:59.999Z'))).toBe(false);
    // 00:00 EDT Oct 7 (eight days out)
    expect(pick(at('2026-10-07T04:00:00.000Z'))).toBe(false);
  });

  it('keys on the FIRST session of a multi-session class', () => {
    // Sessions a week out and later: first is a week out, so pick it.
    expect(
      pick(
        buildClass({
          sessions: [
            { dateTime: new Date('2026-10-13T18:00:00.000Z') },
            { dateTime: WEEK_OUT_2PM },
          ],
        })
      )
    ).toBe(true);
    // A later session a week out, but the class already started.
    expect(
      pick(
        buildClass({
          sessions: [
            { dateTime: new Date('2026-09-29T22:00:00.000Z') },
            { dateTime: WEEK_OUT_2PM },
          ],
        })
      )
    ).toBe(false);
  });

  it('skips a class with no sessions', () => {
    expect(pick(buildClass({ sessions: [] }))).toBe(false);
  });
});

describe('runUnderMinimumAlerts', () => {
  it('alerts staff when confirmed seats are below the minimum', async () => {
    mocks.countByClassId.mockResolvedValue(3);

    const result = await runUnderMinimumAlerts([buildClass()], NOW);

    expect(result).toEqual({
      classesChecked: 1,
      alertsSent: 1,
      skippedMinimumMet: 0,
      skippedAlreadyAlerted: 0,
    });
    // Counts confirmed seats only.
    expect(mocks.countByClassId).toHaveBeenCalledWith('class-1', ['confirmed']);
    expect(mocks.claimUnderMinimumAlert).toHaveBeenCalledWith('class-1', NOW);
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
    const mail = mocks.mailAdd.mock.calls[0][0];
    expect(mail.to).toBe('mock-ADMIN_ALERT_EMAIL');
    expect(mail.message.subject).toBe(
      'Below minimum: Beginner Block Printing, 3 of 4 confirmed'
    );
    expect(mail.message.text).toContain('Instructor: Robin Ashfield');
    expect(mail.message.text).toContain('When: Tuesday, October 6 at 2:00 PM');
    expect(mail.message.text).toContain(
      'mock-ADMIN_PORTAL_URL/classes/class-1/roster'
    );
  });

  it('does not alert at the minimum', async () => {
    mocks.countByClassId.mockResolvedValue(4);

    const result = await runUnderMinimumAlerts([buildClass()], NOW);

    expect(result.skippedMinimumMet).toBe(1);
    expect(result.alertsSent).toBe(0);
    expect(mocks.claimUnderMinimumAlert).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('does not alert above the minimum', async () => {
    mocks.countByClassId.mockResolvedValue(9);
    const result = await runUnderMinimumAlerts([buildClass()], NOW);
    expect(result.skippedMinimumMet).toBe(1);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('never checks a class with no minimum', async () => {
    const result = await runUnderMinimumAlerts(
      [buildClass({ minimumEnrollment: undefined })],
      NOW
    );
    expect(result.classesChecked).toBe(0);
    expect(mocks.countByClassId).not.toHaveBeenCalled();
  });

  it('never checks a cancelled class', async () => {
    const result = await runUnderMinimumAlerts(
      [buildClass({ status: 'cancelled' })],
      NOW
    );
    expect(result.classesChecked).toBe(0);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('skips a class already alerted on an earlier run', async () => {
    mocks.countByClassId.mockResolvedValue(1);

    const result = await runUnderMinimumAlerts(
      [buildClass({ underMinimumAlertSentAt: new Date('2026-09-29T11:00:00Z') })],
      NOW
    );

    expect(result.skippedAlreadyAlerted).toBe(1);
    expect(mocks.claimUnderMinimumAlert).not.toHaveBeenCalled();
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('skips when another run claimed the alert first', async () => {
    mocks.countByClassId.mockResolvedValue(1);
    mocks.claimUnderMinimumAlert.mockResolvedValue(false);

    const result = await runUnderMinimumAlerts([buildClass()], NOW);

    expect(result.skippedAlreadyAlerted).toBe(1);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('releases the claim and carries on when queuing the mail fails', async () => {
    mocks.countByClassId.mockResolvedValue(0);
    mocks.mailAdd
      .mockRejectedValueOnce(new Error('firestore unavailable'))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await runUnderMinimumAlerts(
      [buildClass({ id: 'class-a' }), buildClass({ id: 'class-b' })],
      NOW
    );

    expect(mocks.releaseUnderMinimumAlert).toHaveBeenCalledWith('class-a');
    expect(mocks.releaseUnderMinimumAlert).not.toHaveBeenCalledWith('class-b');
    expect(result.alertsSent).toBe(1);
  });

  it('omits the instructor lookup when none is set', async () => {
    mocks.countByClassId.mockResolvedValue(0);
    await runUnderMinimumAlerts([buildClass({ instructorId: undefined })], NOW);
    expect(mocks.instructorFindById).not.toHaveBeenCalled();
    expect(mocks.mailAdd.mock.calls[0][0].message.text).toContain(
      'Instructor: Not set'
    );
  });
});

describe('buildUnderMinimumAlert', () => {
  it('notes the session count for a multi-session class', () => {
    const content = buildUnderMinimumAlert({
      classEntity: buildClass({
        sessions: [
          { dateTime: new Date('2026-10-13T18:00:00.000Z') },
          { dateTime: WEEK_OUT_2PM },
        ],
      }),
      confirmedCount: 1,
      minimum: 4,
      portalUrl: 'https://portal.example.com/',
    });
    expect(content.text).toContain(
      'When: Tuesday, October 6 at 2:00 PM (first of 2 sessions)'
    );
    // Trailing slash on the origin doesn't double up.
    expect(content.text).toContain(
      'https://portal.example.com/classes/class-1/roster'
    );
  });

  it('escapes HTML in the class name', () => {
    const content = buildUnderMinimumAlert({
      classEntity: buildClass({ name: 'Paper <Marbling> & Ink' }),
      confirmedCount: 0,
      minimum: 4,
      portalUrl: 'https://portal.example.com',
    });
    expect(content.html).toContain('Paper &lt;Marbling&gt; &amp; Ink');
    expect(content.html).not.toContain('<Marbling>');
  });
});
