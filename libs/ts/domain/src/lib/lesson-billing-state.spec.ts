import { describe, expect, it } from 'vitest';
import {
  describeLessonBillingState,
  canStillBillLesson,
  lessonBillingState,
} from './lesson-billing-state';
import type { Invoice } from './invoice';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';

const NOW = new Date('2026-10-05T16:00:00Z');

function charge(
  over: Partial<LessonScheduledCharge> = {}
): LessonScheduledCharge {
  return {
    id: 'chg-1',
    studentId: 'stu-1',
    ruleId: 'rule-1',
    lessonIds: ['lesson-1'],
    amountCents: 3000,
    dueAt: NOW,
    status: 'scheduled',
    idempotencyKey: 'lc-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    studentId: 'stu-1',
    status: 'sent',
    lineItems: [
      {
        id: 'line-1',
        description: '30-min lesson',
        quantity: 1,
        unitAmountCents: 3000,
        subtotalCents: 3000,
        lessonId: 'lesson-1',
      },
    ],
    totalCents: 3000,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Invoice;
}

describe('has this lesson been billed?', () => {
  it('says nothing has, when nothing has', () => {
    // The case the "Send invoice" offer exists for: invoicing is explicit, so
    // a taught lesson bills nobody until a person says so.
    expect(lessonBillingState('lesson-1', [], [])).toEqual({
      kind: 'unbilled',
    });
  });

  it('reports a paid charge, with the day the money moved', () => {
    const resolvedAt = new Date('2026-10-01T15:00:00Z');
    expect(
      lessonBillingState('lesson-1', [charge({ status: 'paid', resolvedAt })], [])
    ).toEqual({ kind: 'charge-paid', on: resolvedAt });
  });

  it('reports a charge that is still coming', () => {
    expect(lessonBillingState('lesson-1', [charge()], [])).toEqual({
      kind: 'charge-pending',
      dueAt: NOW,
    });
  });

  it('treats a failed charge as still pending — it is owed, not gone', () => {
    expect(
      lessonBillingState('lesson-1', [charge({ status: 'failed' })], [])
    ).toMatchObject({ kind: 'charge-pending' });
  });

  it('reports a comped block as written off rather than unbilled', () => {
    expect(
      lessonBillingState('lesson-1', [charge({ status: 'waived' })], [])
    ).toEqual({ kind: 'charge-written-off' });
  });

  it('reports a live invoice', () => {
    expect(lessonBillingState('lesson-1', [], [invoice()])).toEqual({
      kind: 'invoiced',
      status: 'sent',
    });
  });

  it('ignores a voided invoice — that ask was cancelled', () => {
    expect(
      lessonBillingState('lesson-1', [], [invoice({ status: 'void' })])
    ).toEqual({ kind: 'unbilled' });
  });

  it('prefers the charge when both exist, because that is where the money is', () => {
    expect(
      lessonBillingState(
        'lesson-1',
        [charge({ status: 'paid', resolvedAt: NOW })],
        [invoice()]
      )
    ).toMatchObject({ kind: 'charge-paid' });
  });

  it('says nothing about a different lesson', () => {
    expect(lessonBillingState('lesson-2', [charge()], [invoice()])).toEqual({
      kind: 'unbilled',
    });
  });
});

describe('saying what already bills a lesson', () => {
  it('says nothing for an unbilled lesson, because that is the default', () => {
    // A picker labels the rows it cannot offer. Labelling the offerable ones
    // with an absence only makes the billed ones harder to find.
    expect(describeLessonBillingState({ kind: 'unbilled' })).toBeNull();
  });

  it('names the day the money moved', () => {
    expect(
      describeLessonBillingState({
        kind: 'charge-paid',
        on: new Date('2026-10-05T20:00:00Z'),
      })
    ).toBe('Paid Mon, Oct 5');
  });

  it('names the day a charge is coming', () => {
    expect(
      describeLessonBillingState({
        kind: 'charge-pending',
        dueAt: new Date('2026-10-18T20:00:00Z'),
      })
    ).toBe('On a charge due Sun, Oct 18');
  });

  it('says a comped block was not charged for', () => {
    expect(describeLessonBillingState({ kind: 'charge-written-off' })).toBe(
      'Not charged for'
    );
  });

  it('carries an invoice’s status, since sent and draft are different asks', () => {
    expect(
      describeLessonBillingState({ kind: 'invoiced', status: 'draft' })
    ).toBe('On an invoice (draft)');
    expect(describeLessonBillingState({ kind: 'invoiced', status: 'paid' })).toBe(
      'Paid by invoice'
    );
  });
});

describe('whether the studio can still ask for this lesson', () => {
  it('yes when nothing has billed it', () => {
    expect(canStillBillLesson({ kind: 'unbilled' })).toBe(true);
  });

  it.each([
    { kind: 'charge-paid', on: NOW },
    { kind: 'charge-pending', dueAt: NOW },
    { kind: 'invoiced', status: 'sent' },
  ] as const)('no for $kind, which would take the money twice', (state) => {
    expect(canStillBillLesson(state)).toBe(false);
  });

  it('yes for a written-off charge, or a declined card would lose the money', () => {
    // The way out of a failed charge is to waive or cancel it (#102), which
    // lands here. If this said no, a card that declined would mean the lesson
    // could never be invoiced either. The caller shows the label so the second
    // ask is a decision rather than an accident.
    expect(canStillBillLesson({ kind: 'charge-written-off' })).toBe(true);
  });
});
