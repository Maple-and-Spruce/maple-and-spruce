import { describe, it, expect } from 'vitest';
import {
  INVOICE_OVERDUE_DAYS,
  hasInvoiceSyncFailed,
  isHopeUnsubmitted,
  isInvoiceOverdue,
  isLessonUnbilled,
  needsAutoInvoiceEnabled,
  sortAttentionGroups,
  totalAttentionCount,
} from './needs-attention';
import type { NeedsAttentionGroup, NeedsAttentionKind } from './needs-attention';

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
  const invoiced = new Set(['lesson-invoiced']);

  it('flags a rendered private-pay lesson with no invoice line', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: false },
        invoiced
      )
    ).toBe(true);
  });

  it('flags an uninvoiced no-show too, because private pay charges for it', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'no-show' },
        { isHopeScholarship: false },
        invoiced
      )
    ).toBe(true);
  });

  it('never flags a Hope lesson — those bill through EMA', () => {
    expect(
      isLessonUnbilled(
        { id: 'lesson-1', status: 'rendered' },
        { isHopeScholarship: true },
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
        invoiced
      )
    ).toBe(false);
  });
});

describe('needsAutoInvoiceEnabled', () => {
  it('flags an active private-pay student who will never bill automatically', () => {
    expect(
      needsAutoInvoiceEnabled({
        status: 'active',
        isHopeScholarship: false,
        autoInvoice: false,
      })
    ).toBe(true);
  });

  it('ignores an inactive student', () => {
    expect(
      needsAutoInvoiceEnabled({
        status: 'inactive',
        isHopeScholarship: false,
        autoInvoice: false,
      })
    ).toBe(false);
  });

  it('ignores a Hope student, for whom the flag is meaningless', () => {
    // createInvoice refuses Hope students outright, so autoInvoice is moot.
    expect(
      needsAutoInvoiceEnabled({
        status: 'active',
        isHopeScholarship: true,
        autoInvoice: false,
      })
    ).toBe(false);
  });

  it('is false once the flag is on', () => {
    expect(
      needsAutoInvoiceEnabled({
        status: 'active',
        isHopeScholarship: false,
        autoInvoice: true,
      })
    ).toBe(false);
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
      group('student-autoinvoice-off', 9),
      group('invoice-overdue', 5),
      group('invoice-sync-failed', 1),
    ]);

    // Sorted by cost of ignoring, not by count — otherwise the most numerous
    // nuisance sits on top and the one real emergency is buried.
    expect(sorted.map((g) => g.kind)).toEqual([
      'invoice-sync-failed',
      'invoice-overdue',
      'student-autoinvoice-off',
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
