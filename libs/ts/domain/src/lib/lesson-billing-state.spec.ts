import { describe, expect, it } from 'vitest';
import { lessonBillingState } from './lesson-billing-state';
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
