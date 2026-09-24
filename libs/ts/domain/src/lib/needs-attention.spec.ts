import { describe, it, expect } from 'vitest';
import {
  INVOICE_OVERDUE_DAYS,
  hasInvoiceSyncFailed,
  isHopeUnsubmitted,
  isInvoiceOverdue,
  isLessonUnbilled,
  sortAttentionGroups,
  totalAttentionCount,
} from './needs-attention';
import type { NeedsAttentionGroup, NeedsAttentionKind } from './needs-attention';
import type { Invoice } from './invoice';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';

const NOW = new Date('2026-09-10T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('isInvoiceOverdue', () => {
  it('flags a sent invoice past the chase window', () => {
    expect(
      isInvoiceOverdue(
        { status: 'sent', issuedAt: daysAgo(INVOICE_OVERDUE_DAYS) },
        NOW
      )
    ).toBe(true);
  });

  it('leaves a recent invoice alone', () => {
    // A family who pays monthly should not be nagged after three days.
    expect(
      isInvoiceOverdue({ status: 'sent', issuedAt: daysAgo(3) }, NOW)
    ).toBe(false);
  });

  it.each(['paid', 'void', 'draft'] as const)(
    'never flags a %s invoice however old',
    (status) => {
      expect(isInvoiceOverdue({ status, issuedAt: daysAgo(400) }, NOW)).toBe(
        false
      );
    }
  );

  it('does not flag a sent invoice with no issue date rather than assuming', () => {
    expect(isInvoiceOverdue({ status: 'sent', issuedAt: undefined }, NOW)).toBe(
      false
    );
  });
});

describe('hasInvoiceSyncFailed', () => {
  it('flags an invoice that never reached Square', () => {
    // The family was never asked to pay. This is the worst of the six.
    expect(
      hasInvoiceSyncFailed({ squareSyncError: 'Status code: 404', status: 'sent' })
    ).toBe(true);
  });

  it('ignores a stale error on a voided invoice', () => {
    expect(
      hasInvoiceSyncFailed({ squareSyncError: 'Status code: 404', status: 'void' })
    ).toBe(false);
  });

  it('is false when the sync succeeded', () => {
    expect(
      hasInvoiceSyncFailed({ squareSyncError: undefined, status: 'sent' })
    ).toBe(false);
  });
});

describe('isLessonUnbilled', () => {
  const AT = new Date('2026-10-05T16:00:00Z');

  /** An invoice naming one lesson. */
  const invoiceFor = (lessonId: string, status: Invoice['status'] = 'sent') =>
    ({
      id: `inv-${lessonId}`,
      studentId: 'stu-1',
      status,
      lineItems: [{ id: 'l', description: 'lesson', lessonId, quantity: 1, unitAmountCents: 3000, subtotalCents: 3000 }],
      totalCents: 3000,
      createdAt: AT,
      updatedAt: AT,
    }) as Invoice;

  /** A charge covering one lesson. */
  const chargeFor = (
    lessonId: string,
    status: LessonScheduledCharge['status'] = 'paid'
  ) =>
    ({
      id: `chg-${lessonId}`,
      studentId: 'stu-1',
      ruleId: 'manual',
      lessonIds: [lessonId],
      amountCents: 3000,
      dueAt: AT,
      status,
      idempotencyKey: 'lc-1',
      resolvedAt: AT,
      createdAt: AT,
      updatedAt: AT,
    }) as LessonScheduledCharge;

  const invoiced = [invoiceFor('lesson-invoiced')];

  it('flags a rendered private-pay lesson nobody has been asked to pay for', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: false },
        [],
        invoiced
      )
    ).toBe(true);
  });

  it('flags an unbilled no-show too, because private pay charges for it', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'no-show' },
        { isHopeScholarship: false },
        [],
        invoiced
      )
    ).toBe(true);
  });

  it('never flags a Hope lesson — those bill through EMA', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: true },
        [],
        invoiced
      )
    ).toBe(false);
  });

  it.each(['scheduled', 'cancelled'] as const)(
    'does not flag a %s lesson',
    (status) => {
      expect(
        isLessonUnbilled(
          { id: 'lesson-1', status },
          { isHopeScholarship: false },
          [],
          invoiced
        )
      ).toBe(false);
    }
  );

  it('is satisfied once an invoice line exists', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-invoiced', status: 'rendered' },
        { isHopeScholarship: false },
        [],
        invoiced
      )
    ).toBe(false);
  });

  // #111. Charging the card is the studio's main way of billing, so a panel
  // that only looks at invoices calls almost every billed lesson unbilled.
  it('is satisfied by a paid card charge, not only by an invoice', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: false },
        [chargeFor('lesson-1', 'paid')],
        []
      )
    ).toBe(false);
  });

  it('is satisfied by a charge still to be taken — it has been asked for', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: false },
        [chargeFor('lesson-1', 'scheduled')],
        []
      )
    ).toBe(false);
  });

  it('is satisfied by a failed charge — it is owed on a charge that exists', () => {
    // The failed charge is its own task on the billing screen, with Try again
    // and Waive on it. Listing the lesson here as well would double-count it.
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: false },
        [chargeFor('lesson-1', 'failed')],
        []
      )
    ).toBe(false);
  });

  it('is satisfied by a waived charge — a human decided not to charge', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: false },
        [chargeFor('lesson-1', 'waived')],
        []
      )
    ).toBe(false);
  });

  it('flags a lesson again once its only invoice is voided', () => {
    // A void invoice is a cancelled ask, so the money is owed again and the row
    // has to come back. The old inline set counted void invoices and kept it
    // hidden (#111).
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: false },
        [],
        [invoiceFor('lesson-1', 'void')]
      )
    ).toBe(true);
  });

  it('does not confuse one lesson with another on the same charge', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-2', status: 'rendered' },
        { isHopeScholarship: false },
        [chargeFor('lesson-1', 'paid')],
        []
      )
    ).toBe(true);
  });
});

describe('isHopeUnsubmitted', () => {
  it('flags a rendered Hope lesson with no claim', () => {
    expect(isHopeUnsubmitted({ status: 'rendered' }, undefined)).toBe(true);
  });

  it('flags one EMA rejected, because it is still unpaid work', () => {
    expect(isHopeUnsubmitted({ status: 'rendered' }, 'rejected')).toBe(true);
  });

  it.each(['submitted', 'paid'] as const)('clears once %s', (status) => {
    expect(isHopeUnsubmitted({ status: 'rendered' }, status)).toBe(false);
  });

  it('never flags a no-show — Hope pays only for services rendered', () => {
    expect(isHopeUnsubmitted({ status: 'no-show' }, undefined)).toBe(false);
  });
});

describe('sortAttentionGroups', () => {
  const group = (
    kind: NeedsAttentionKind,
    rowCount: number
  ): NeedsAttentionGroup => ({
    kind,
    title: kind,
    because: '',
    rows: Array.from({ length: rowCount }, (_, i) => ({
      kind,
      id: `${kind}-${i}`,
      label: '',
      resolution: 'navigate' as const,
    })),
  });

  it('puts money that will never arrive above money that is merely late', () => {
    const sorted = sortAttentionGroups([
      group('lesson-unattributed', 9),
      group('invoice-overdue', 5),
      group('invoice-sync-failed', 1),
    ]);

    // Sorted by cost of ignoring, not by count — otherwise the most numerous
    // nuisance sits on top and the one real emergency is buried.
    expect(sorted.map((g) => g.kind)).toEqual([
      'invoice-sync-failed',
      'invoice-overdue',
      'lesson-unattributed',
    ]);
  });

  it('drops empty groups so the panel stays quiet', () => {
    const sorted = sortAttentionGroups([
      group('invoice-overdue', 0),
      group('lesson-unbilled', 2),
    ]);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].kind).toBe('lesson-unbilled');
  });

  it('returns nothing when there is nothing to do', () => {
    const sorted = sortAttentionGroups([group('invoice-overdue', 0)]);
    expect(sorted).toEqual([]);
    expect(totalAttentionCount(sorted)).toBe(0);
  });
});
