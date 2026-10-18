import { describe, it, expect } from 'vitest';
import {
  contractorAgreementSignedOnline,
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
/** A pay rate, the fourth readiness item. */
const rated = { payRate: 0.8, payRateType: 'percentage' as const };

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
      missing: ['contractor-agreement', 'background-check', 'payment-setup', 'pay-rate'],
    });
  });

  it('is ready once all three items are recorded and a pay rate is set', () => {
    expect(instructorReadiness({ isContractor: true, readiness: allDone, ...rated })).toEqual({
      kind: 'ready',
    });
  });

  it('does not need the optional agreement reference', () => {
    const readiness = {
      ...allDone,
      contractorAgreement: { signedOn: '2026-09-01' },
    };
    expect(instructorReadiness({ isContractor: true, readiness, ...rated }).kind).toBe('ready');
  });

  it('lists only what is outstanding, in checklist order', () => {
    const readiness: InstructorReadiness = {
      backgroundCheck: { clearedOn: '2026-09-10' },
    };
    expect(instructorReadiness({ isContractor: true, readiness, ...rated })).toEqual({
      kind: 'not-ready',
      missing: ['contractor-agreement', 'payment-setup'],
    });
  });

  it('treats an empty date as not done', () => {
    const readiness: InstructorReadiness = {
      ...allDone,
      backgroundCheck: { clearedOn: '' },
    };
    expect(instructorReadiness({ isContractor: true, readiness, ...rated })).toEqual({
      kind: 'not-ready',
      missing: ['background-check'],
    });
  });

  it('needs a pay rate even when the paperwork is done', () => {
    expect(instructorReadiness({ isContractor: true, readiness: allDone })).toEqual({
      kind: 'not-ready',
      missing: ['pay-rate'],
    });
  });

  it('counts a rate only with a type and a positive amount', () => {
    const check = (rate: Partial<Pick<Instructor, 'payRate' | 'payRateType'>>) =>
      instructorReadiness({ isContractor: true, readiness: allDone, ...rate }).kind;
    expect(check({ payRate: 0.8 })).toBe('not-ready');
    expect(check({ payRateType: 'percentage' })).toBe('not-ready');
    expect(check({ payRate: 0, payRateType: 'percentage' })).toBe('not-ready');
    // Any kind of rate clears readiness; class payouts flag a non-percentage separately.
    expect(check({ payRate: 5000, payRateType: 'flat' })).toBe('ready');
    expect(check({ payRate: 2500, payRateType: 'hourly' })).toBe('ready');
  });

  it('never asks a non-contractor for a pay rate', () => {
    expect(instructorReadiness({ isContractor: false })).toEqual({ kind: 'not-applicable' });
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
    expect(describeMissingReadiness(['payment-setup', 'pay-rate'])).toBe(
      'payment setup and pay rate'
    );
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

describe('contractorAgreementSignedOnline', () => {
  it('dates the signature by the studio day, not the UTC day', () => {
    // 9pm Oct 14 in New York is Oct 15 in UTC.
    expect(
      contractorAgreementSignedOnline(new Date('2026-10-15T01:00:00Z'), 'sa-1')
    ).toEqual({
      signedOn: '2026-10-14',
      reference: 'Signed online, agreement sa-1',
    });
  });

  it('clears the agreement item of readiness', () => {
    const contractorAgreement = contractorAgreementSignedOnline(
      new Date('2026-10-14T15:00:00Z'),
      'sa-1'
    );
    expect(
      instructorReadiness({
        isContractor: true,
        readiness: { ...allDone, contractorAgreement },
        ...rated,
      })
    ).toEqual({ kind: 'ready' });
  });
});
