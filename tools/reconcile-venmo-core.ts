/**
 * Pure matching core for the Venmo statement reconciliation tool (#630).
 *
 * No firebase-admin / no @maple imports — self-contained and unit-testable.
 * The runnable script (`reconcile-venmo.ts`) does the Firestore I/O and calls
 * these functions.
 *
 * Venmo Business Profiles have no API/webhook, so lesson payments are attested
 * by a human (`venmo-manual`) and this tool reconciles those attestations
 * against the downloaded Venmo statement CSV:
 *   - a statement row that matches an unpaid `sent` invoice  → the teacher
 *     forgot to mark it; SETTLE it (`venmo-import`).
 *   - a statement row that matches a `venmo-manual` invoice   → CONFIRM the
 *     attestation (upgrade source to `venmo-import`).
 *   - a statement row that matches nothing                    → unknown payer
 *     / wrong amount; report for investigation.
 *   - a `venmo-manual` invoice with NO statement row          → attested but
 *     the money never arrived; ALERT (the dangerous direction).
 */

export interface VenmoRow {
  /** 1-based line number in the source CSV, for reporting. */
  rowIndex: number;
  datetime?: Date;
  type: string;
  status: string;
  /** Payer as it appears on the statement — a Venmo @handle or a display name. */
  from: string;
  /** Positive = money received by the business, in cents. */
  amountCents: number;
  note: string;
}

export interface StudentLite {
  id: string;
  name: string;
  venmoUsername?: string;
  primaryContactName?: string;
}

export interface InvoiceLite {
  id: string;
  studentId: string;
  status: string; // draft | sent | paid | void
  totalCents: number;
  /** paymentRecord.source when present. */
  paymentSource?: string;
  issuedAt?: Date;
  createdAt?: Date;
}

export interface LessonLite {
  id: string;
  studentId: string;
  status: string; // scheduled | rendered | cancelled
  scheduledAt?: Date;
}

export type RowAction =
  | 'settle' // sent invoice → mark paid venmo-import
  | 'confirm' // venmo-manual invoice → upgrade to venmo-import
  | 'already-imported' // already venmo-import — no-op (idempotent re-run)
  | 'unknown-payer' // no student matched the "from"
  | 'ambiguous-student' // >1 student matched — needs a human
  | 'no-amount-match'; // student known, but no invoice at that amount

export interface RowMatch {
  row: VenmoRow;
  student?: StudentLite;
  invoice?: InvoiceLite;
  action: RowAction;
  reason: string;
}

export interface ReconcileResult {
  settle: RowMatch[];
  confirm: RowMatch[];
  alreadyImported: RowMatch[];
  unmatchedRows: RowMatch[];
  /** venmo-manual paid invoices with no matching statement row. */
  attestedNoMoney: InvoiceLite[];
  /** Lessons still `scheduled` with a past date — never rendered/attested. */
  neverAttestedLessons: LessonLite[];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Parse a Venmo amount cell ("+ $40.00", "- $5.00", "$40") to signed cents. */
export function parseAmountToCents(raw: string): number {
  if (!raw) return 0;
  const negative = /-/.test(raw);
  const digits = raw.replace(/[^0-9.]/g, '');
  if (!digits) return 0;
  const value = Number.parseFloat(digits);
  if (Number.isNaN(value)) return 0;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Normalize a Venmo handle / name for comparison. */
export function normalizeIdentity(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, ' ');
}

/** Split one CSV line honoring double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function findColumn(headers: string[], patterns: RegExp[]): number {
  for (const pat of patterns) {
    const idx = headers.findIndex((h) => pat.test(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

export interface ParsedStatement {
  rows: VenmoRow[];
  /** Non-payment / outgoing / incomplete rows skipped. */
  skipped: number;
  headerFound: boolean;
}

/**
 * Parse a Venmo Business statement CSV. Tolerant to the preamble/summary rows
 * Venmo includes and to column reordering (columns are found by header name).
 * Returns only completed INCOMING payments (money received by the business).
 */
export function parseVenmoCsv(text: string): ParsedStatement {
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const hasDate = cells.some((c) => /datetime|^date$/i.test(c));
    const hasAmount = cells.some((c) => /amount/i.test(c));
    if (hasDate && hasAmount) {
      headerIdx = i;
      headers = cells;
      break;
    }
  }
  if (headerIdx === -1) {
    return { rows: [], skipped: 0, headerFound: false };
  }

  const col = {
    date: findColumn(headers, [/datetime/i, /^date$/i]),
    type: findColumn(headers, [/^type$/i]),
    status: findColumn(headers, [/^status$/i]),
    from: findColumn(headers, [/^from$/i]),
    amount: findColumn(headers, [
      /amount\s*\(total\)/i,
      /amount\s*\(net\)/i,
      /^amount/i,
    ]),
    note: findColumn(headers, [/^note$/i]),
  };

  const rows: VenmoRow[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const cells = splitCsvLine(lines[i]);
    const at = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx] : '');

    const type = at(col.type);
    const status = at(col.status);
    const amountCents = parseAmountToCents(at(col.amount));

    // Keep only completed, incoming payments. Venmo fires many row types
    // (transfers, fees, refunds) and outgoing charges (negative) — skip those.
    const isPayment = /payment/i.test(type);
    const isComplete = status === '' || /complete/i.test(status);
    if (!isPayment || !isComplete || amountCents <= 0) {
      // A summary/preamble row (no type, no amount) is also skipped here.
      if (type || at(col.amount)) skipped++;
      continue;
    }

    const dateStr = at(col.date);
    const parsedDate = dateStr ? new Date(dateStr) : undefined;
    rows.push({
      rowIndex: i + 1,
      datetime:
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate
          : undefined,
      type,
      status,
      from: at(col.from),
      amountCents,
      note: at(col.note),
    });
  }

  return { rows, skipped, headerFound: true };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Resolve the student a statement row's payer refers to, if unambiguous. */
export function resolveStudent(
  from: string,
  students: StudentLite[]
): { student?: StudentLite; ambiguous: boolean } {
  const key = normalizeIdentity(from);
  if (!key) return { ambiguous: false };

  // 1. Exact Venmo handle match (strongest signal).
  const byHandle = students.filter(
    (s) => s.venmoUsername && normalizeIdentity(s.venmoUsername) === key
  );
  if (byHandle.length === 1) return { student: byHandle[0], ambiguous: false };
  if (byHandle.length > 1) return { ambiguous: true };

  // 2. Fall back to name match (Venmo statements often show a display name,
  //    not the @handle). Match the payer name against the contact/student name.
  const byName = students.filter((s) => {
    const contact = normalizeIdentity(s.primaryContactName);
    const name = normalizeIdentity(s.name);
    return contact === key || name === key;
  });
  if (byName.length === 1) return { student: byName[0], ambiguous: false };
  if (byName.length > 1) return { ambiguous: true };

  return { ambiguous: false };
}

function dateDistance(a?: Date, b?: Date): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(a.getTime() - b.getTime());
}

/**
 * Pick the best invoice for a resolved payment: an unpaid `sent` invoice at
 * the same amount (→ settle), else a `venmo-manual` paid one (→ confirm), else
 * an already-`venmo-import` one (→ no-op). Ties broken by date proximity to
 * the statement row.
 */
function pickInvoice(
  row: VenmoRow,
  studentInvoices: InvoiceLite[]
): { invoice?: InvoiceLite; action: RowAction } {
  const sameAmount = studentInvoices.filter(
    (i) => i.totalCents === row.amountCents
  );
  const closest = (list: InvoiceLite[]) =>
    [...list].sort(
      (a, b) =>
        dateDistance(row.datetime, a.issuedAt ?? a.createdAt) -
        dateDistance(row.datetime, b.issuedAt ?? b.createdAt)
    )[0];

  const sent = sameAmount.filter((i) => i.status === 'sent');
  if (sent.length > 0) return { invoice: closest(sent), action: 'settle' };

  const venmoManual = sameAmount.filter(
    (i) => i.status === 'paid' && i.paymentSource === 'venmo-manual'
  );
  if (venmoManual.length > 0) {
    return { invoice: closest(venmoManual), action: 'confirm' };
  }

  const alreadyImported = sameAmount.filter(
    (i) => i.status === 'paid' && i.paymentSource === 'venmo-import'
  );
  if (alreadyImported.length > 0) {
    return { invoice: closest(alreadyImported), action: 'already-imported' };
  }

  return { action: 'no-amount-match' };
}

export interface MatchOptions {
  /** Treat a lesson `scheduled` before this as "never attested". Default now. */
  now?: Date;
}

export function matchStatement(
  rows: VenmoRow[],
  students: StudentLite[],
  invoices: InvoiceLite[],
  lessons: LessonLite[],
  options: MatchOptions = {}
): ReconcileResult {
  const now = options.now ?? new Date();
  const invoicesByStudent = new Map<string, InvoiceLite[]>();
  for (const inv of invoices) {
    const list = invoicesByStudent.get(inv.studentId) ?? [];
    list.push(inv);
    invoicesByStudent.set(inv.studentId, list);
  }

  const result: ReconcileResult = {
    settle: [],
    confirm: [],
    alreadyImported: [],
    unmatchedRows: [],
    attestedNoMoney: [],
    neverAttestedLessons: [],
  };
  const matchedInvoiceIds = new Set<string>();

  for (const row of rows) {
    const { student, ambiguous } = resolveStudent(row.from, students);
    if (ambiguous) {
      result.unmatchedRows.push({
        row,
        action: 'ambiguous-student',
        reason: `"${row.from}" matches more than one student — resolve by hand`,
      });
      continue;
    }
    if (!student) {
      result.unmatchedRows.push({
        row,
        action: 'unknown-payer',
        reason: `no student matches "${row.from}" — save their Venmo username on the student`,
      });
      continue;
    }

    const { invoice, action } = pickInvoice(
      row,
      invoicesByStudent.get(student.id) ?? []
    );

    if (action === 'no-amount-match' || !invoice) {
      result.unmatchedRows.push({
        row,
        student,
        action: 'no-amount-match',
        reason: `${student.name}: no open/attested invoice for $${(
          row.amountCents / 100
        ).toFixed(2)}`,
      });
      continue;
    }

    matchedInvoiceIds.add(invoice.id);
    const match: RowMatch = {
      row,
      student,
      invoice,
      action,
      reason:
        action === 'settle'
          ? `${student.name}: settle sent invoice ${invoice.id}`
          : action === 'confirm'
            ? `${student.name}: confirm attested invoice ${invoice.id}`
            : `${student.name}: already imported (${invoice.id})`,
    };
    if (action === 'settle') result.settle.push(match);
    else if (action === 'confirm') result.confirm.push(match);
    else result.alreadyImported.push(match);
  }

  // Reverse drift: venmo-manual attestations with no statement row backing them.
  result.attestedNoMoney = invoices.filter(
    (i) =>
      i.status === 'paid' &&
      i.paymentSource === 'venmo-manual' &&
      !matchedInvoiceIds.has(i.id)
  );

  // Never-attested lessons: still scheduled with a past date.
  result.neverAttestedLessons = lessons.filter(
    (l) =>
      l.status === 'scheduled' && l.scheduledAt && l.scheduledAt.getTime() < now.getTime()
  );

  return result;
}
