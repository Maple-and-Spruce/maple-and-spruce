import { describe, it, expect } from 'vitest';
import { lessonPaymentState } from './lesson-payment-state';
import type { LessonChargeStatus } from './lesson-scheduled-charge';
import type { InvoiceStatus } from './invoice';

const DUE = new Date('2026-10-16T14:00:00Z');

function charge(status: LessonChargeStatus, lessonIds = ['les-1']) {
  return { status, lessonIds, dueAt: DUE };
}

function invoice(status: InvoiceStatus, lessonId = 'les-1') {
  return { status, lineItems: [{ id: 'l1', lessonId } as never] };
}

describe('lessonPaymentState', () => {
  it('is paid when a paid charge names the lesson', () => {
    expect(lessonPaymentState('les-1', [charge('paid')], [])).toEqual({
      state: 'paid',
    });
  });

  it('is failed when the charge naming it failed', () => {
    expect(lessonPaymentState('les-1', [charge('failed')], [])).toEqual({
      state: 'failed',
    });
  });

  it('is waived when the charge naming it was waived', () => {
    expect(lessonPaymentState('les-1', [charge('waived')], [])).toEqual({
      state: 'waived',
    });
  });

  it.each(['scheduled', 'charging'] as const)(
    'is scheduled, with the due date, for a %s charge',
    (status) => {
      expect(lessonPaymentState('les-1', [charge(status)], [])).toEqual({
        state: 'scheduled',
        dueAt: DUE,
      });
    },
  );

  it('ignores a cancelled charge and falls through to invoices', () => {
    expect(
      lessonPaymentState('les-1', [charge('cancelled')], [invoice('paid')]),
    ).toEqual({ state: 'paid' });
    expect(lessonPaymentState('les-1', [charge('cancelled')], [])).toEqual({
      state: 'unbilled',
    });
  });

  it('ignores charges for other lessons', () => {
    expect(
      lessonPaymentState('les-1', [charge('paid', ['les-2'])], []),
    ).toEqual({ state: 'unbilled' });
  });

  it('prefers the most settled charge when several name the lesson', () => {
    expect(
      lessonPaymentState(
        'les-1',
        [charge('waived'), charge('failed'), charge('paid'), charge('scheduled')],
        [],
      ),
    ).toEqual({ state: 'paid' });
    expect(
      lessonPaymentState('les-1', [charge('failed'), charge('scheduled')], []),
    ).toEqual({ state: 'scheduled', dueAt: DUE });
  });

  it('lets a charge speak before an invoice', () => {
    expect(
      lessonPaymentState('les-1', [charge('failed')], [invoice('paid')]),
    ).toEqual({ state: 'failed' });
  });

  it('is paid when a paid invoice line names the lesson', () => {
    expect(lessonPaymentState('les-1', [], [invoice('paid')])).toEqual({
      state: 'paid',
    });
  });

  it.each(['draft', 'sent'] as const)(
    'is scheduled, without a due date, for a %s invoice',
    (status) => {
      expect(lessonPaymentState('les-1', [], [invoice(status)])).toEqual({
        state: 'scheduled',
      });
    },
  );

  it('ignores void invoices and invoices for other lessons', () => {
    expect(
      lessonPaymentState('les-1', [], [invoice('void'), invoice('paid', 'les-2')]),
    ).toEqual({ state: 'unbilled' });
  });

  it('is unbilled with nothing at all', () => {
    expect(lessonPaymentState('les-1', [], [])).toEqual({ state: 'unbilled' });
  });
});
