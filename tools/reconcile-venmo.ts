/**
 * Venmo statement ↔ Firestore invoice reconciliation (#630).
 *
 * Venmo Business Profiles have no API/webhook, so in-person lesson payments are
 * attested by a human (`venmo-manual`, PR #640). This tool takes the downloaded
 * Venmo Business statement CSV and reconciles it against the invoices:
 *
 *   - SETTLE   — a statement row matches an unpaid `sent` invoice (the teacher
 *                forgot to mark it) → mark it paid, source `venmo-import`.
 *   - CONFIRM  — a row matches a `venmo-manual` invoice → upgrade the source to
 *                `venmo-import` (the money really arrived).
 *   - UNMATCHED — a row matches no student/invoice → unknown payer or wrong
 *                amount; investigate / save the payer's Venmo username.
 *   - ALERT    — a `venmo-manual` invoice with NO statement row → attested but
 *                the money never arrived (revenue leak).
 *   - Also lists lessons still `scheduled` in the past (never attested).
 *
 * Read-only by default; pass --apply to write the SETTLE/CONFIRM updates.
 *
 * Usage:
 *   # download the statement CSV from venmo.com (Statements → export)
 *   npx tsx tools/reconcile-venmo.ts --csv ~/Downloads/venmo-statement.csv           # dev, dry-run
 *   npx tsx tools/reconcile-venmo.ts --csv ./venmo.csv --prod                        # prod, dry-run
 *   npx tsx tools/reconcile-venmo.ts --csv ./venmo.csv --prod --apply                # prod, write
 *
 * Firestore auth is ADC — run `gcloud auth application-default login` first.
 *
 * NOTE: verify the CSV column names against a real export the first time. The
 * parser finds columns by header name (Datetime / Type / Status / From /
 * Amount / Note) and tolerates reordering, but Venmo may rename them.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  matchStatement,
  parseVenmoCsv,
  type InvoiceLite,
  type LessonLite,
  type ReconcileResult,
  type RowMatch,
  type StudentLite,
} from './reconcile-venmo-core';

const argv = process.argv.slice(2);
const isProd = argv.includes('--prod');
const apply = argv.includes('--apply');
const csvPath = argValue('--csv') ?? firstPositional();
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

function argValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}
function firstPositional(): string | undefined {
  return argv.find((a) => !a.startsWith('--'));
}

if (!csvPath) {
  console.error(
    'Provide the Venmo statement CSV: --csv <path> (or as a positional arg).'
  );
  process.exit(1);
}

console.log(`Project: ${projectId}`);
console.log(`CSV:     ${csvPath}`);
console.log(`Mode:    ${apply ? 'APPLY (writes SETTLE/CONFIRM)' : 'DRY-RUN (read-only)'}`);
console.log();

const app = initializeApp({ projectId });
const db = getFirestore(app);

function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function dateStr(d: Date | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}

async function loadStudents(): Promise<StudentLite[]> {
  const snap = await db.collection('students').get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name ?? '',
      venmoUsername: data.venmoUsername,
      primaryContactName: data.primaryContactName,
    };
  });
}

async function loadInvoices(): Promise<InvoiceLite[]> {
  const snap = await db.collection('invoices').get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      studentId: data.studentId,
      status: data.status,
      totalCents: data.totalCents ?? 0,
      paymentSource: data.paymentRecord?.source,
      issuedAt: toDate(data.issuedAt),
      createdAt: toDate(data.createdAt),
    };
  });
}

async function loadScheduledLessons(): Promise<LessonLite[]> {
  const snap = await db
    .collection('lessons')
    .where('status', '==', 'scheduled')
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      studentId: data.studentId,
      status: data.status,
      scheduledAt: toDate(data.scheduledAt),
    };
  });
}

function importNote(match: RowMatch): string {
  const parts = [`Venmo import — from ${match.row.from}`];
  if (match.row.datetime) parts.push(`on ${dateStr(match.row.datetime)}`);
  if (match.row.note) parts.push(`(${match.row.note})`);
  return parts.join(' ');
}

async function applySettle(match: RowMatch): Promise<void> {
  const now = new Date();
  await db.collection('invoices').doc(match.invoice!.id).update({
    status: 'paid',
    paidAt: now,
    issuedAt: match.invoice!.issuedAt ?? now,
    paymentRecord: {
      source: 'venmo-import',
      note: importNote(match),
      recordedAt: now,
    },
    updatedAt: now,
  });
}

async function applyConfirm(match: RowMatch): Promise<void> {
  const now = new Date();
  // Upgrade the source in place — keep the original recordedAt/recordedByUid.
  await db.collection('invoices').doc(match.invoice!.id).update({
    'paymentRecord.source': 'venmo-import',
    'paymentRecord.note': importNote(match),
    updatedAt: now,
  });
}

function buildReport(result: ReconcileResult, studentById: Map<string, StudentLite>): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push('# Venmo ↔ Invoice reconciliation');
  lines.push('');
  lines.push(`**Generated:** ${today}`);
  lines.push(`**Project:** ${projectId}`);
  lines.push(`**Mode:** ${apply ? 'APPLY' : 'DRY-RUN'}`);
  lines.push('');
  lines.push(`- Settle (forgot to mark paid): **${result.settle.length}**`);
  lines.push(`- Confirm (attestation verified): **${result.confirm.length}**`);
  lines.push(`- Already imported (no-op): ${result.alreadyImported.length}`);
  lines.push(`- Unmatched statement rows: **${result.unmatchedRows.length}**`);
  lines.push(`- ⚠️ Attested but no money in statement: **${result.attestedNoMoney.length}**`);
  lines.push(`- Lessons scheduled in the past (never attested): ${result.neverAttestedLessons.length}`);
  lines.push('');

  const rowTable = (title: string, matches: RowMatch[], blurb: string) => {
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(blurb);
    lines.push('');
    if (matches.length === 0) {
      lines.push('_None._');
      lines.push('');
      return;
    }
    lines.push('| Date | From | Amount | Student | Invoice | Note |');
    lines.push('|---|---|---|---|---|---|');
    for (const m of matches) {
      lines.push(
        `| ${dateStr(m.row.datetime)} | ${m.row.from} | ${money(m.row.amountCents)} | ${m.student?.name ?? '—'} | ${m.invoice?.id ?? '—'} | ${m.reason} |`
      );
    }
    lines.push('');
  };

  rowTable(
    '1. Settle — teacher forgot to mark paid',
    result.settle,
    'Statement rows matching an unpaid `sent` invoice. With `--apply` these are marked paid (`venmo-import`).'
  );
  rowTable(
    '2. Confirm — attestation verified by the statement',
    result.confirm,
    'Rows matching a `venmo-manual` invoice. With `--apply` the source is upgraded to `venmo-import`.'
  );
  rowTable(
    '3. Unmatched statement rows',
    result.unmatchedRows,
    'Money arrived but no invoice matched — unknown payer or wrong amount. Save the payer’s Venmo username on the student, or investigate.'
  );

  lines.push('## 4. ⚠️ Attested but no money in the statement');
  lines.push('');
  lines.push(
    'Invoices marked paid via Venmo (`venmo-manual`) with **no matching row** in this statement. Either the statement window does not cover them, or the money never actually arrived — investigate.'
  );
  lines.push('');
  if (result.attestedNoMoney.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| Invoice | Student | Amount |');
    lines.push('|---|---|---|');
    for (const inv of result.attestedNoMoney) {
      lines.push(
        `| ${inv.id} | ${studentById.get(inv.studentId)?.name ?? inv.studentId} | ${money(inv.totalCents)} |`
      );
    }
  }
  lines.push('');

  lines.push('## 5. Lessons scheduled in the past (never attested)');
  lines.push('');
  lines.push(
    'Still `scheduled` with a past date — never marked rendered, so never invoiced. May need attention.'
  );
  lines.push('');
  if (result.neverAttestedLessons.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| Lesson | Student | Scheduled |');
    lines.push('|---|---|---|');
    for (const l of result.neverAttestedLessons) {
      lines.push(
        `| ${l.id} | ${studentById.get(l.studentId)?.name ?? l.studentId} | ${dateStr(l.scheduledAt)} |`
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}

async function main(): Promise<void> {
  const text = readFileSync(csvPath as string, 'utf8');
  const parsed = parseVenmoCsv(text);
  if (!parsed.headerFound) {
    console.error(
      'Could not find a Venmo statement header (Datetime + Amount columns) in the CSV. Is this a Venmo Business statement export?'
    );
    process.exit(1);
  }
  console.log(
    `Parsed ${parsed.rows.length} incoming payment(s) (${parsed.skipped} non-payment/outgoing rows skipped).`
  );

  const [students, invoices, lessons] = await Promise.all([
    loadStudents(),
    loadInvoices(),
    loadScheduledLessons(),
  ]);
  const studentById = new Map(students.map((s) => [s.id, s]));

  const result = matchStatement(parsed.rows, students, invoices, lessons);

  console.log();
  console.log(`  Settle:            ${result.settle.length}`);
  console.log(`  Confirm:           ${result.confirm.length}`);
  console.log(`  Already imported:  ${result.alreadyImported.length}`);
  console.log(`  Unmatched rows:    ${result.unmatchedRows.length}`);
  console.log(`  ⚠️ Attested/no money: ${result.attestedNoMoney.length}`);
  console.log(`  Past scheduled:    ${result.neverAttestedLessons.length}`);
  console.log();

  if (apply) {
    let settled = 0;
    for (const m of result.settle) {
      await applySettle(m);
      settled++;
      console.log(`  SETTLED  ${m.invoice!.id} (${m.student?.name}) ${money(m.row.amountCents)}`);
    }
    let confirmed = 0;
    for (const m of result.confirm) {
      await applyConfirm(m);
      confirmed++;
      console.log(`  CONFIRMED ${m.invoice!.id} (${m.student?.name})`);
    }
    console.log(`\nApplied ${settled} settle + ${confirmed} confirm update(s).`);
  } else {
    console.log('Dry-run — no writes. Re-run with --apply to settle/confirm.');
  }

  const report = buildReport(result, studentById);
  const outDir = join(process.cwd(), 'evidence');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(
    outDir,
    `venmo-reconciliation-${new Date().toISOString().slice(0, 10)}.md`
  );
  writeFileSync(outPath, report);
  console.log(`\nWrote ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
