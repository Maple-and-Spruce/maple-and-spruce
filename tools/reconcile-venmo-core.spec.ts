import { describe, it, expect } from 'vitest';
import {
  parseAmountToCents,
  normalizeIdentity,
  splitCsvLine,
  parseVenmoCsv,
  resolveStudent,
  matchStatement,
  type InvoiceLite,
  type LessonLite,
  type StudentLite,
  type VenmoRow,
} from './reconcile-venmo-core';

describe('parseAmountToCents', () => {
  it('parses "+ $40.00" as 4000', () => {
    expect(parseAmountToCents('+ $40.00')).toBe(4000);
  });
  it('parses a plain "$132" as 13200', () => {
    expect(parseAmountToCents('$132')).toBe(13200);
  });
  it('parses negative (outgoing) amounts', () => {
    expect(parseAmountToCents('- $5.00')).toBe(-500);
  });
  it('handles thousands separators', () => {
    expect(parseAmountToCents('$1,234.56')).toBe(123456);
  });
  it('returns 0 on empty/garbage', () => {
    expect(parseAmountToCents('')).toBe(0);
    expect(parseAmountToCents('N/A')).toBe(0);
  });
});

describe('normalizeIdentity', () => {
  it('strips a leading @, lowercases, collapses whitespace', () => {
    expect(normalizeIdentity('@Casey-Nguyen')).toBe('casey-nguyen');
    expect(normalizeIdentity('  Casey   Nguyen ')).toBe('casey nguyen');
  });
});

describe('splitCsvLine', () => {
  it('honors quoted fields containing commas', () => {
    expect(splitCsvLine('a,"b, still b",c')).toEqual(['a', 'b, still b', 'c']);
  });
  it('handles escaped double quotes', () => {
    expect(splitCsvLine('"she said ""hi""",x')).toEqual(['she said "hi"', 'x']);
  });
});

const VENMO_CSV = `Account Statement - (@Maple-Spruce)
Account Activity

,ID,Datetime,Type,Status,Note,From,To,Amount (total)
,,,,,,,,
,1001,2026-07-03T10:00:00,Payment,Complete,Guitar lesson,casey-nguyen,Maple-Spruce,+ $40.00
,1002,2026-07-05T14:00:00,Payment,Complete,July lessons,Dana Lopez,Maple-Spruce,+ $132.00
,1003,2026-07-06T09:00:00,Payment,Complete,thanks,unknown-person,Maple-Spruce,+ $50.00
,1004,2026-07-07T09:00:00,Standard Transfer,Complete,,Maple-Spruce,Bank,- $200.00
,1005,2026-07-08T09:00:00,Payment,Complete,refund,Maple-Spruce,someone,- $40.00
,,,,,,,,In-progress balance
`;

describe('parseVenmoCsv', () => {
  it('finds the header past the preamble and keeps only incoming payments', () => {
    const { rows, headerFound, skipped } = parseVenmoCsv(VENMO_CSV);
    expect(headerFound).toBe(true);
    // 1001, 1002, 1003 are incoming payments; the transfer + outgoing refund
    // are skipped.
    expect(rows.map((r) => r.amountCents)).toEqual([4000, 13200, 5000]);
    expect(rows[0].from).toBe('casey-nguyen');
    expect(rows[0].note).toBe('Guitar lesson');
    expect(skipped).toBeGreaterThanOrEqual(2);
  });

  it('reports headerFound=false for an unrecognizable file', () => {
    expect(parseVenmoCsv('nothing,useful\n1,2').headerFound).toBe(false);
  });
});

describe('resolveStudent', () => {
  const students: StudentLite[] = [
    { id: 's1', name: 'Juniper Nguyen', venmoUsername: 'casey-nguyen', primaryContactName: 'Casey Nguyen' },
    { id: 's2', name: 'Dana Lopez', primaryContactName: 'Dana Lopez' },
    { id: 's3', name: 'Sam Twin', primaryContactName: 'Pat Twin' },
    { id: 's4', name: 'Alex Twin', primaryContactName: 'Pat Twin' },
  ];

  it('matches by Venmo handle', () => {
    expect(resolveStudent('casey-nguyen', students).student?.id).toBe('s1');
    expect(resolveStudent('@Casey-Nguyen', students).student?.id).toBe('s1');
  });
  it('falls back to contact/student name', () => {
    expect(resolveStudent('Dana Lopez', students).student?.id).toBe('s2');
  });
  it('flags ambiguous when >1 student shares the payer name (siblings)', () => {
    const r = resolveStudent('Pat Twin', students);
    expect(r.ambiguous).toBe(true);
    expect(r.student).toBeUndefined();
  });
  it('returns nothing for an unknown payer', () => {
    expect(resolveStudent('nobody', students).student).toBeUndefined();
  });
});

function row(overrides: Partial<VenmoRow>): VenmoRow {
  return {
    rowIndex: 1,
    datetime: new Date('2026-07-03T10:00:00'),
    type: 'Payment',
    status: 'Complete',
    from: 'casey-nguyen',
    amountCents: 4000,
    note: '',
    ...overrides,
  };
}

describe('matchStatement', () => {
  const students: StudentLite[] = [
    { id: 's1', name: 'Juniper', venmoUsername: 'casey-nguyen', primaryContactName: 'Casey Nguyen' },
    { id: 's2', name: 'Dana Lopez', primaryContactName: 'Dana Lopez' },
  ];

  it('settles an unpaid sent invoice the teacher forgot to mark', () => {
    const invoices: InvoiceLite[] = [
      { id: 'inv-1', studentId: 's1', status: 'sent', totalCents: 4000 },
    ];
    const res = matchStatement([row({})], students, invoices, []);
    expect(res.settle).toHaveLength(1);
    expect(res.settle[0].invoice?.id).toBe('inv-1');
    expect(res.confirm).toHaveLength(0);
    expect(res.attestedNoMoney).toHaveLength(0);
  });

  it('confirms a venmo-manual attestation', () => {
    const invoices: InvoiceLite[] = [
      { id: 'inv-2', studentId: 's1', status: 'paid', paymentSource: 'venmo-manual', totalCents: 4000 },
    ];
    const res = matchStatement([row({})], students, invoices, []);
    expect(res.confirm).toHaveLength(1);
    expect(res.confirm[0].invoice?.id).toBe('inv-2');
  });

  it('treats an already-imported invoice as a no-op (idempotent re-run)', () => {
    const invoices: InvoiceLite[] = [
      { id: 'inv-3', studentId: 's1', status: 'paid', paymentSource: 'venmo-import', totalCents: 4000 },
    ];
    const res = matchStatement([row({})], students, invoices, []);
    expect(res.alreadyImported).toHaveLength(1);
    expect(res.settle).toHaveLength(0);
    expect(res.confirm).toHaveLength(0);
    expect(res.attestedNoMoney).toHaveLength(0);
  });

  it('reports an unknown payer', () => {
    const res = matchStatement([row({ from: 'ghost' })], students, [], []);
    expect(res.unmatchedRows).toHaveLength(1);
    expect(res.unmatchedRows[0].action).toBe('unknown-payer');
  });

  it('reports a known student with no invoice at that amount', () => {
    const invoices: InvoiceLite[] = [
      { id: 'inv-x', studentId: 's1', status: 'sent', totalCents: 9999 },
    ];
    const res = matchStatement([row({})], students, invoices, []);
    expect(res.unmatchedRows[0].action).toBe('no-amount-match');
  });

  it('flags a venmo-manual invoice with no statement row (attested, no money)', () => {
    const invoices: InvoiceLite[] = [
      // Attested paid, but no row for $99 exists in the statement.
      { id: 'inv-ghost', studentId: 's2', status: 'paid', paymentSource: 'venmo-manual', totalCents: 9900 },
    ];
    const res = matchStatement([row({})], students, invoices, []);
    expect(res.attestedNoMoney.map((i) => i.id)).toEqual(['inv-ghost']);
  });

  it('prefers settling a sent invoice over confirming a paid one at the same amount', () => {
    const invoices: InvoiceLite[] = [
      { id: 'inv-sent', studentId: 's1', status: 'sent', totalCents: 4000 },
      { id: 'inv-paid', studentId: 's1', status: 'paid', paymentSource: 'venmo-manual', totalCents: 4000 },
    ];
    const res = matchStatement([row({})], students, invoices, []);
    expect(res.settle.map((m) => m.invoice?.id)).toEqual(['inv-sent']);
  });

  it('lists lessons still scheduled in the past as never-attested', () => {
    const lessons: LessonLite[] = [
      { id: 'l-old', studentId: 's1', status: 'scheduled', scheduledAt: new Date('2026-06-01') },
      { id: 'l-future', studentId: 's1', status: 'scheduled', scheduledAt: new Date('2026-09-01') },
      { id: 'l-done', studentId: 's1', status: 'rendered', scheduledAt: new Date('2026-06-01') },
    ];
    const res = matchStatement([], students, [], lessons, {
      now: new Date('2026-07-15'),
    });
    expect(res.neverAttestedLessons.map((l) => l.id)).toEqual(['l-old']);
  });
});
