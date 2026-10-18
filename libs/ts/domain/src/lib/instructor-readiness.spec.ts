import { describe, it, expect } from 'vitest';
import {
  describeMissingReadiness,
  instructorReadiness,
  toPublicInstructor,
  type Instructor,
  type InstructorReadiness,
} from './instructor';

const allDone: InstructorReadiness = {
  contractorAgreement: { signedOn: '2026-09-01', reference: 'https://example.com/signed.pdf' },
  backgroundCheck: { clearedOn: '2026-09-10' },
  paymentSetup: { completedOn: '2026-09-12', method: 'square-payroll' },
};

describe('instructorReadiness', () => {
  it('is not applicable when the instructor is not a contractor', () => {
    expect(instructorReadiness({})).toEqual({ kind: 'not-applicable' });
    expect(instructorReadiness({ isContractor: false, readiness: {} })).toEqual({
      kind: 'not-applicable',
    });
  });

  it('lists every item as missing for a contractor with no record', () => {
    expect(instructorReadiness({ isContractor: true })).toEqual({
      kind: 'not-ready',
      missing: ['contractor-agreement', 'background-check', 'payment-setup'],
    });
  });

  it('is ready once all three items are recorded', () => {
    expect(instructorReadiness({ isContractor: true, readiness: allDone })).toEqual({
      kind: 'ready',
    });
  });

  it('does not need the optional agreement reference', () => {
    const readiness = {
      ...allDone,
      contractorAgreement: { signedOn: '2026-09-01' },
    };
    expect(instructorReadiness({ isContractor: true, readiness }).kind).toBe('ready');
  });

  it('lists only what is outstanding, in checklist order', () => {
    const readiness: InstructorReadiness = {
      backgroundCheck: { clearedOn: '2026-09-10' },
    };
    expect(instructorReadiness({ isContractor: true, readiness })).toEqual({
      kind: 'not-ready',
      missing: ['contractor-agreement', 'payment-setup'],
    });
  });

  it('treats an empty date as not done', () => {
    const readiness: InstructorReadiness = {
      ...allDone,
      backgroundCheck: { clearedOn: '' },
    };
    expect(instructorReadiness({ isContractor: true, readiness })).toEqual({
      kind: 'not-ready',
      missing: ['background-check'],
    });
  });
});

describe('describeMissingReadiness', () => {
  it('joins items as prose', () => {
    expect(describeMissingReadiness([])).toBe('');
    expect(describeMissingReadiness(['background-check'])).toBe('background check');
    expect(describeMissingReadiness(['contractor-agreement', 'payment-setup'])).toBe(
      'contractor agreement and payment setup'
    );
    expect(
      describeMissingReadiness(['contractor-agreement', 'background-check', 'payment-setup'])
    ).toBe('contractor agreement, background check and payment setup');
  });
});

describe('toPublicInstructor', () => {
  it('never carries the contractor flag or the readiness record', () => {
    const instructor: Instructor = {
      id: 'instructor-1',
      name: 'Robin Ashfield',
      email: 'robin@example.com',
      status: 'active',
      isContractor: true,
      readiness: allDone,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const result = toPublicInstructor(instructor) as unknown as Record<string, unknown>;

    expect(result).not.toHaveProperty('isContractor');
    expect(result).not.toHaveProperty('readiness');
    expect(JSON.stringify(result)).not.toContain('2026-09');
  });
});
