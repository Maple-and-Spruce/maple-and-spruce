import { describe, expect, it } from 'vitest';
import type { Invoice } from './invoice';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';
import {
  buildBillingRecords,
  invoiceDate,
  isChargeSettled,
  isInvoiceSettled,
  isLessonShownByDefault,
  isManualCharge,
} from './student-billing-view';

const T0 = new Date('2026-09-01T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    studentId: 'stu-1',
    status: 'sent',
    lineItems: [
      {
        id: 'line-1',
        description: 'Lesson',
        lessonId: 'les-1',
        quantity: 1,
        unitAmountCents: 4125,
        subtotalCents: 4125,
      },
      {
        id: 'line-2',
        description: 'Books',
        quantity: 1,
        unitAmountCents: 1000,
        subtotalCents: 1000,
      },
    ],
    totalCents: 5125,
    issuedAt: at(2),
    createdAt: at(1),
    updatedAt: at(2),
    ...over,
  };
}

function charge(over: Partial<LessonScheduledCharge> = {}): LessonScheduledCharge {
  return {
    id: 'chg-1',
    studentId: 'stu-1',
    ruleId: 'rule-standard',
    lessonIds: ['les-2', 'les-3', 'les-4', 'les-5'],
    amountCents: 16500,
    dueAt: at(5),
    status: 'scheduled',
    idempotencyKey: 'lesson-chg-1',
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

describe('isManualCharge', () => {
  it('is false for a charge a rule planned', () => {
    expect(isManualCharge(charge())).toBe(false);
  });

  it('recognises the manual source field', () => {
    expect(isManualCharge({ ...charge(), source: 'manual' })).toBe(true);
  });

  it('recognises the manual rule id sentinel on its own', () => {
    expect(isManualCharge(charge({ ruleId: 'manual' }))).toBe(true);
  });
});

describe('isChargeSettled', () => {
  it.each([
    ['paid', true],
    ['cancelled', true],
    ['waived', true],
    ['scheduled', false],
    ['charging', false],
    // Money earned and not collected: it must stay in front of Katie.
    ['failed', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(isChargeSettled({ status })).toBe(expected);
  });
});

describe('isInvoiceSettled', () => {
  it.each([
    ['paid', true],
    ['void', true],
    ['draft', false],
    ['sent', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(isInvoiceSettled({ status })).toBe(expected);
  });
});

describe('invoiceDate', () => {
  it('uses when it went out', () => {
    expect(invoiceDate(invoice())).toEqual(at(2));
  });

  it('falls back to when a draft was created', () => {
    expect(invoiceDate(invoice({ issuedAt: undefined }))).toEqual(at(1));
  });
});

describe('buildBillingRecords', () => {
  it('merges invoices and charges oldest first', () => {
    const records = buildBillingRecords(
      [invoice({ id: 'inv-late', issuedAt: at(9) }), invoice()],
      [charge()]
    );
    expect(records.map((r) => r.id)).toEqual(['inv-1', 'chg-1', 'inv-late']);
  });

  it('tells automatic and manual charges apart', () => {
    const records = buildBillingRecords(
      [],
      [charge(), charge({ id: 'chg-2', ruleId: 'manual', dueAt: at(6) })]
    );
    expect(records.map((r) => r.kind)).toEqual([
      'automatic-charge',
      'manual-charge',
    ]);
  });

  it('takes an invoice’s lessons from its lesson lines only', () => {
    const [record] = buildBillingRecords([invoice()], []);
    expect(record.lessonIds).toEqual(['les-1']);
    expect(record.amountCents).toBe(5125);
  });

  it('carries a block charge’s lessons and a single amount', () => {
    const [record] = buildBillingRecords([], [charge()]);
    expect(record.lessonIds).toHaveLength(4);
    expect(record.amountCents).toBe(16500);
    expect(record.date).toEqual(at(5));
  });

  it('marks settled records', () => {
    const records = buildBillingRecords(
      [invoice({ status: 'paid' })],
      [charge({ status: 'failed' })]
    );
    expect(records.map((r) => r.isSettled)).toEqual([true, false]);
  });
});

describe('isLessonShownByDefault', () => {
  const now = T0;

  it('shows an upcoming lesson', () => {
    expect(
      isLessonShownByDefault({ scheduledAt: at(1), status: 'scheduled' }, now)
    ).toBe(true);
  });

  it('shows an upcoming lesson even when cancelled', () => {
    expect(
      isLessonShownByDefault({ scheduledAt: at(1), status: 'cancelled' }, now)
    ).toBe(true);
  });

  it('hides a past lesson that has an outcome', () => {
    expect(
      isLessonShownByDefault({ scheduledAt: at(-1), status: 'rendered' }, now)
    ).toBe(false);
    expect(
      isLessonShownByDefault({ scheduledAt: at(-1), status: 'no-show' }, now)
    ).toBe(false);
  });

  it('keeps a past lesson still waiting to be marked taught', () => {
    expect(
      isLessonShownByDefault({ scheduledAt: at(-1), status: 'scheduled' }, now)
    ).toBe(true);
  });
});
