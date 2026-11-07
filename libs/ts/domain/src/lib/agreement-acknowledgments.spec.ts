import { describe, expect, it } from 'vitest';
import {
  SECTION_ACKNOWLEDGMENT_TEXT,
  applyAgreementVariables,
  instructorAgreementVariables,
  missingAcknowledgments,
  requiredAcknowledgments,
} from './agreement-acknowledgments';
import type { AgreementSection } from './agreement-template';

const contractor: AgreementSection = {
  id: 'contractor',
  title: '1. Independent contractor',
  content: '<p>By checking each box below, you acknowledge:</p>',
  responseType: 'acknowledgment',
  acknowledgmentItems: [
    'I provide services as an independent contractor.',
    '  ',
    'I will not be treated as an employee.',
  ],
};
const safety: AgreementSection = {
  id: 'safety',
  title: '6. Safety',
  content: '<p>Studio rules.</p>',
  responseType: 'acknowledgment',
};
const pay: AgreementSection = {
  id: 'pay',
  title: '3. Pay',
  content: '<p>You receive {{instructorSharePercent}}%; we keep {{ studioSharePercent }}%.</p>',
};

describe('requiredAcknowledgments', () => {
  it('gives each statement its own checkbox and skips blank lines', () => {
    expect(requiredAcknowledgments([contractor])).toEqual([
      {
        key: 'contractor:0',
        sectionId: 'contractor',
        text: 'I provide services as an independent contractor.',
      },
      {
        key: 'contractor:1',
        sectionId: 'contractor',
        text: 'I will not be treated as an employee.',
      },
    ]);
  });

  it('gives an acknowledgment section with no statements one checkbox', () => {
    expect(requiredAcknowledgments([safety])).toEqual([
      { key: 'safety:section', sectionId: 'safety', text: SECTION_ACKNOWLEDGMENT_TEXT },
    ]);
  });

  it('asks nothing of a plain section', () => {
    expect(requiredAcknowledgments([pay])).toEqual([]);
  });
});

describe('missingAcknowledgments', () => {
  it('lists every unchecked box', () => {
    const missing = missingAcknowledgments([contractor, safety], ['contractor:0']);
    expect(missing.map((m) => m.key)).toEqual(['contractor:1', 'safety:section']);
  });

  it('treats no answer as nothing checked', () => {
    expect(missingAcknowledgments([safety], undefined)).toHaveLength(1);
  });

  it('is empty when all are checked', () => {
    expect(
      missingAcknowledgments([contractor, safety], [
        'contractor:0',
        'contractor:1',
        'safety:section',
      ])
    ).toEqual([]);
  });
});

describe('instructorAgreementVariables', () => {
  it('fills the split for a percentage rate', () => {
    expect(
      instructorAgreementVariables({ payRate: 0.75, payRateType: 'percentage' })
    ).toEqual({ instructorSharePercent: '75', studioSharePercent: '25' });
  });

  it('keeps one decimal place', () => {
    expect(
      instructorAgreementVariables({ payRate: 0.825, payRateType: 'percentage' })
    ).toEqual({ instructorSharePercent: '82.5', studioSharePercent: '17.5' });
  });

  it.each([
    ['no instructor', undefined],
    ['no rate', { payRateType: 'percentage' as const }],
    ['a flat rate', { payRate: 50, payRateType: 'flat' as const }],
    ['a rate over 100%', { payRate: 80, payRateType: 'percentage' as const }],
  ])('is empty for %s', (_label, instructor) => {
    expect(instructorAgreementVariables(instructor)).toEqual({});
  });
});

describe('applyAgreementVariables', () => {
  it('fills content, titles and statements', () => {
    const { sections, unresolved } = applyAgreementVariables(
      [pay, { ...contractor, acknowledgmentItems: ['I get {{instructorSharePercent}}%.'] }],
      { instructorSharePercent: '75', studioSharePercent: '25' }
    );
    expect(unresolved).toEqual([]);
    expect(sections[0].content).toBe('<p>You receive 75%; we keep 25%.</p>');
    expect(sections[1].acknowledgmentItems).toEqual(['I get 75%.']);
  });

  it('reports placeholders it cannot fill and leaves them in place', () => {
    const { sections, unresolved } = applyAgreementVariables([pay], {});
    expect(unresolved.sort()).toEqual(['instructorSharePercent', 'studioSharePercent']);
    expect(sections[0].content).toContain('{{instructorSharePercent}}');
  });

  it('does not touch the input', () => {
    applyAgreementVariables([pay], { instructorSharePercent: '75', studioSharePercent: '25' });
    expect(pay.content).toContain('{{instructorSharePercent}}');
  });
});
