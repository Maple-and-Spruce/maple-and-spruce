import { describe, it, expect } from 'vitest';
import { readinessFormValuesFrom, readinessFromFormValues } from './readiness-form';

describe('readinessFormValuesFrom', () => {
  it('starts a new instructor as a contractor with nothing recorded', () => {
    expect(readinessFormValuesFrom()).toEqual({
      isContractor: true,
      agreementSignedOn: '',
      agreementReference: '',
      backgroundCheckClearedOn: '',
      paymentSetupCompletedOn: '',
      paymentSetupMethod: '',
    });
  });

  it('keeps an existing instructor untracked when they were never flagged', () => {
    expect(readinessFormValuesFrom({}).isContractor).toBe(false);
  });

  it('flattens an existing record', () => {
    expect(
      readinessFormValuesFrom({
        isContractor: true,
        readiness: {
          contractorAgreement: { signedOn: '2026-09-01', reference: 'Binder' },
          backgroundCheck: { clearedOn: '2026-09-10' },
          paymentSetup: { completedOn: '2026-09-12', method: 'w9-on-file' },
        },
      })
    ).toEqual({
      isContractor: true,
      agreementSignedOn: '2026-09-01',
      agreementReference: 'Binder',
      backgroundCheckClearedOn: '2026-09-10',
      paymentSetupCompletedOn: '2026-09-12',
      paymentSetupMethod: 'w9-on-file',
    });
  });
});

describe('readinessFromFormValues', () => {
  const blank = readinessFormValuesFrom();

  it('returns an empty record when nothing is filled, so a clear reaches Firestore', () => {
    expect(readinessFromFormValues(blank)).toEqual({
      isContractor: true,
      readiness: {},
    });
  });

  it('round-trips a full record', () => {
    const values = {
      ...blank,
      agreementSignedOn: '2026-09-01',
      agreementReference: '  Binder  ',
      backgroundCheckClearedOn: '2026-09-10',
      paymentSetupCompletedOn: '2026-09-12',
      paymentSetupMethod: 'square-payroll' as const,
    };
    expect(readinessFromFormValues(values).readiness).toEqual({
      contractorAgreement: { signedOn: '2026-09-01', reference: 'Binder' },
      backgroundCheck: { clearedOn: '2026-09-10' },
      paymentSetup: { completedOn: '2026-09-12', method: 'square-payroll' },
    });
  });

  it('keeps a half-filled item so validation can report it', () => {
    const { readiness } = readinessFromFormValues({
      ...blank,
      paymentSetupMethod: 'w9-on-file',
      agreementReference: 'Binder',
    });
    expect(readiness.paymentSetup).toEqual({ completedOn: '', method: 'w9-on-file' });
    expect(readiness.contractorAgreement).toEqual({ signedOn: '', reference: 'Binder' });
  });
});
