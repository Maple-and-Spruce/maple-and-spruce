/**
 * Reconcile MailerLite subscribers against actual class registrations in
 * Firestore. Read-only — does not mutate anything in MailerLite or
 * Firestore.
 *
 * Outputs evidence/mailerlite-reconciliation-YYYY-MM-DD.md with three lists:
 *
 *   1. Verified attendees — subscribers who have at least one confirmed
 *      registration. The hand-curated seed for a future "Class Attendees"
 *      group, once registration-time opt-in is wired up.
 *   2. Attendees not on the list — registered customers (primary + named
 *      additional attendees) who never subscribed. Hand-add only with
 *      verbal/written consent.
 *   3. Subscribers who have never registered — cold-but-interested cohort
 *      to pitch "try your first class" to.
 *
 * Usage:
 *   MAILERLITE_API_KEY=... npx tsx tools/reconcile-mailerlite-attendees.ts
 *   MAILERLITE_API_KEY=... npx tsx tools/reconcile-mailerlite-attendees.ts --prod
 *
 * The key comes from MailerLite → Integrations → API. Any read-scope key works.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const isProd = process.argv.includes('--prod');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const apiKey = process.env.MAILERLITE_API_KEY;
if (!apiKey) {
  console.error(
    'Set MAILERLITE_API_KEY (MailerLite dashboard → Integrations → API).'
  );
  process.exit(1);
}

console.log(`Project: ${projectId}`);
console.log('Mode:    READ-ONLY (no writes to MailerLite or Firestore)');
console.log();

const app = initializeApp({ projectId });
const db = getFirestore(app);

interface Subscriber {
  email: string;
  status: string;
  createdAt: string;
}

async function fetchAllSubscribers(): Promise<Subscriber[]> {
  const all: Subscriber[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL('https://connect.mailerlite.com/api/subscribers');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`MailerLite API ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data: Array<{ email: string; status: string; created_at: string }>;
      links?: { next?: string | null };
    };
    for (const s of body.data) {
      all.push({
        email: s.email.toLowerCase().trim(),
        status: s.status,
        createdAt: s.created_at,
      });
    }
    if (body.links?.next) {
      const parsed = new URL(body.links.next);
      cursor = parsed.searchParams.get('cursor') ?? undefined;
    } else {
      cursor = undefined;
    }
  } while (cursor);
  return all;
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

interface AttendeeSummary {
  email: string;
  name: string;
  /** Count of confirmed registrations this email appears on (primary or +1). */
  registrationCount: number;
  /** Distinct class names this person attended. */
  classNames: Set<string>;
  /** Most recent registration createdAt across all their registrations. */
  lastRegistrationAt: Date | undefined;
  /** True if any of their registrations had them as a primary registrant. */
  wasPrimary: boolean;
}

function upsertAttendee(
  byEmail: Map<string, AttendeeSummary>,
  rawEmail: string,
  name: string,
  className: string,
  createdAt: Date | undefined,
  asPrimary: boolean
): void {
  const email = rawEmail.toLowerCase().trim();
  if (!email) return;
  const existing = byEmail.get(email);
  if (existing) {
    existing.registrationCount += 1;
    existing.classNames.add(className);
    if (
      createdAt &&
      (!existing.lastRegistrationAt || createdAt > existing.lastRegistrationAt)
    ) {
      existing.lastRegistrationAt = createdAt;
    }
    if (asPrimary) existing.wasPrimary = true;
    if (!existing.name && name) existing.name = name;
  } else {
    byEmail.set(email, {
      email,
      name,
      registrationCount: 1,
      classNames: new Set([className]),
      lastRegistrationAt: createdAt,
      wasPrimary: asPrimary,
    });
  }
}

async function fetchAttendeeSummaries(): Promise<Map<string, AttendeeSummary>> {
  const classSnap = await db.collection('classes').get();
  const classNameById = new Map<string, string>();
  for (const doc of classSnap.docs) {
    const data = doc.data();
    classNameById.set(doc.id, (data.name as string) ?? doc.id);
  }

  const regSnap = await db
    .collection('registrations')
    .where('status', '==', 'confirmed')
    .get();

  const byEmail = new Map<string, AttendeeSummary>();
  for (const doc of regSnap.docs) {
    const data = doc.data();
    const createdAt = toDate(data.createdAt);
    const className =
      classNameById.get(data.classId as string) ??
      (data.classId as string | undefined) ??
      'Unknown class';

    const primaryEmail = (data.customerEmail as string | undefined) ?? '';
    const primaryName = (data.customerName as string | undefined) ?? '';
    if (primaryEmail) {
      upsertAttendee(byEmail, primaryEmail, primaryName, className, createdAt, true);
    }

    const extras =
      (data.additionalAttendees as
        | Array<{ name?: string; email?: string }>
        | undefined) ?? [];
    for (const extra of extras) {
      if (!extra?.email) continue;
      upsertAttendee(
        byEmail,
        extra.email,
        extra.name ?? '',
        className,
        createdAt,
        false
      );
    }
  }
  return byEmail;
}

function formatDate(d: Date | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|');
}

async function main(): Promise<void> {
  const [subs, attendeesByEmail] = await Promise.all([
    fetchAllSubscribers(),
    fetchAttendeeSummaries(),
  ]);

  const subEmails = new Set(subs.map((s) => s.email));

  const verifiedAttendees: AttendeeSummary[] = [];
  const attendeesOffList: AttendeeSummary[] = [];
  for (const a of attendeesByEmail.values()) {
    if (subEmails.has(a.email)) verifiedAttendees.push(a);
    else attendeesOffList.push(a);
  }
  const subscribersNoClass = subs.filter((s) => !attendeesByEmail.has(s.email));

  const byRecent = (a: AttendeeSummary, b: AttendeeSummary) =>
    (b.lastRegistrationAt?.getTime() ?? 0) -
    (a.lastRegistrationAt?.getTime() ?? 0);
  verifiedAttendees.sort(byRecent);
  attendeesOffList.sort(byRecent);

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push('# MailerLite ↔ Registrations reconciliation');
  lines.push('');
  lines.push(`**Generated:** ${today}`);
  lines.push(`**Project:** ${projectId}`);
  lines.push(`**Active subscribers:** ${subs.length}`);
  lines.push(`**Unique attendee emails (confirmed regs):** ${attendeesByEmail.size}`);
  lines.push('');
  lines.push(`- Verified attendees on the list: **${verifiedAttendees.length}**`);
  lines.push(`- Attendees NOT on the list: **${attendeesOffList.length}**`);
  lines.push(`- Subscribers who've never registered: **${subscribersNoClass.length}**`);
  lines.push('');
  lines.push(
    'Attendee counts include primary registrants and any additional attendees that supplied an email.'
  );
  lines.push('');

  lines.push('## 1. Verified attendees (warm "Class Attendees" cohort)');
  lines.push('');
  lines.push(
    'On the MailerLite list AND have at least one confirmed registration. Highest-confidence candidates to assign to the Class Attendees group, after capturing opt-in consent.'
  );
  lines.push('');
  lines.push('| Email | Name | # Regs | Primary? | Most recent | Classes |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of verifiedAttendees) {
    lines.push(
      `| ${escapeMd(r.email)} | ${escapeMd(r.name)} | ${r.registrationCount} | ${r.wasPrimary ? 'yes' : '+1'} | ${formatDate(r.lastRegistrationAt)} | ${escapeMd([...r.classNames].join(', '))} |`
    );
  }
  lines.push('');

  lines.push('## 2. Registered customers NOT on the MailerLite list');
  lines.push('');
  lines.push(
    'Paid for a class but never subscribed. Ask them in person (with opt-in) before adding — no automated add until the registration form has a marketing-opt-in checkbox.'
  );
  lines.push('');
  lines.push('| Email | Name | # Regs | Primary? | Most recent | Classes |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of attendeesOffList) {
    lines.push(
      `| ${escapeMd(r.email)} | ${escapeMd(r.name)} | ${r.registrationCount} | ${r.wasPrimary ? 'yes' : '+1'} | ${formatDate(r.lastRegistrationAt)} | ${escapeMd([...r.classNames].join(', '))} |`
    );
  }
  lines.push('');

  lines.push('## 3. Subscribers who have never registered');
  lines.push('');
  lines.push(
    'On the list, never attended. Cold-but-interested. Worth pitching a "try your first class" message to.'
  );
  lines.push('');
  lines.push('| Email | Subscribed |');
  lines.push('|---|---|');
  for (const s of subscribersNoClass) {
    lines.push(`| ${escapeMd(s.email)} | ${s.createdAt.slice(0, 10)} |`);
  }
  lines.push('');

  const outDir = join(process.cwd(), 'evidence');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `mailerlite-reconciliation-${today}.md`);
  writeFileSync(outPath, lines.join('\n'));
  console.log(`Wrote ${outPath}`);
  console.log(
    `Verified: ${verifiedAttendees.length}  Off-list: ${attendeesOffList.length}  No-class subs: ${subscribersNoClass.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
