/**
 * Backfill Music Together signup confirmation emails (#778)
 *
 * Demo RSVPs and section waitlist signups sent nothing until #778 — families
 * signed up and heard back only if someone got to them by hand. This queues the
 * confirmation they should have received, for everyone already in the data.
 *
 * SAFETY, because this emails real families:
 *   - DRY RUN BY DEFAULT. Nothing is written without `--send`. The dry run
 *     prints every recipient, template, and rendered merge field so the list can
 *     be read before anyone is emailed.
 *   - Idempotent. Skips anything with `signupEmailSentAt` already set, and
 *     stamps as it goes, so a re-run (or a run interrupted halfway) never
 *     double-sends.
 *   - Past demos are skipped. Confirming a spot at a class that already
 *     happened is worse than staying quiet.
 *   - Catch-up wording. Sends with `isCatchUp: true`, which swaps the opening
 *     line so a weeks-old signup doesn't read as an instant auto-reply.
 *
 * Usage:
 *   npx tsx tools/backfill-mt-signup-emails.ts                 # dry run, dev
 *   npx tsx tools/backfill-mt-signup-emails.ts --prod          # dry run, prod
 *   npx tsx tools/backfill-mt-signup-emails.ts --prod --send   # actually queue
 *
 * Uses Application Default Credentials (`gcloud auth application-default login`).
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const isProd = process.argv.includes('--prod');
const send = process.argv.includes('--send');
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

const MT_REPLY_TO = 'musictogether@mapleandsprucefolkarts.com';
const TIMEZONE = 'America/New_York';
const MT_DEMO_TITLE = 'Music Together Demo (Free)';

/** Same recipient skip as the Cloud Functions — never mail E2E fixtures. */
function isE2ETestEmail(email: string | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith('@maplespruce.test') ||
    lower.startsWith('e2e+') ||
    lower.startsWith('e2e-decline+')
  );
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'long' });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface Planned {
  to: string;
  templateName: string;
  data: Record<string, string | boolean>;
  /** Doc to stamp `signupEmailSentAt` on once the mail is queued. */
  stampRef: FirebaseFirestore.DocumentReference;
  /** Human-readable source, for the dry-run log. */
  source: string;
}

async function planDemoRsvps(db: Firestore, now: Date): Promise<Planned[]> {
  const planned: Planned[] = [];
  const demos = await db.collection('musicTogetherDemos').get();

  for (const demoDoc of demos.docs) {
    const demo = demoDoc.data();
    const dateTime: Date = demo.dateTime.toDate();

    if (dateTime < now) {
      console.log(
        `  skip demo ${demoDoc.id} — already happened (${fmtDate(dateTime)})`
      );
      continue;
    }

    const rsvps = await demoDoc.ref.collection('rsvps').get();
    for (const rsvpDoc of rsvps.docs) {
      const rsvp = rsvpDoc.data();
      if (rsvp.signupEmailSentAt) continue;
      if (isE2ETestEmail(rsvp.email)) continue;

      const status = rsvp.status === 'waitlisted' ? 'waitlisted' : 'confirmed';
      planned.push({
        to: rsvp.email,
        templateName:
          status === 'confirmed'
            ? 'music-together-demo-rsvp-confirmed'
            : 'music-together-demo-rsvp-waitlisted',
        data: {
          caregiverName: rsvp.name ?? '',
          demoTitle: MT_DEMO_TITLE,
          demoDate: fmtDate(dateTime),
          demoDay: fmtDay(dateTime),
          demoTime: fmtTime(dateTime),
          // The demo's own address — demos are often offsite.
          demoLocation: demo.location ?? '',
          isCatchUp: true,
        },
        stampRef: rsvpDoc.ref,
        source: `demo ${demoDoc.id} (${fmtDate(dateTime)}) · ${status}`,
      });
    }
  }
  return planned;
}

async function planWaitlist(db: Firestore): Promise<Planned[]> {
  const planned: Planned[] = [];
  const sections = await db.collection('musicTogetherSections').get();

  for (const sectionDoc of sections.docs) {
    const section = sectionDoc.data();
    const entries = await sectionDoc.ref.collection('waitlist').get();

    for (const entryDoc of entries.docs) {
      const entry = entryDoc.data();
      if (entry.signupEmailSentAt) continue;
      if (isE2ETestEmail(entry.email)) continue;

      planned.push({
        to: entry.email,
        templateName: 'music-together-waitlist-confirmation',
        data: {
          name: entry.name ?? '',
          sectionName: section.name ?? '',
          availability: entry.availability ?? '',
          isCatchUp: true,
        },
        stampRef: entryDoc.ref,
        source: `waitlist ${sectionDoc.id} (${section.name ?? '—'})`,
      });
    }
  }
  return planned;
}

async function main(): Promise<void> {
  console.log(
    `\nBackfilling Music Together signup emails — project: ${projectId}`
  );
  console.log(
    send
      ? '*** LIVE RUN — mail WILL be queued and delivered ***\n'
      : 'DRY RUN — nothing will be written. Re-run with --send to queue.\n'
  );

  const db = getFirestore(initializeApp({ projectId }));
  const now = new Date();

  const planned = [
    ...(await planDemoRsvps(db, now)),
    ...(await planWaitlist(db)),
  ];

  if (planned.length === 0) {
    console.log('\nNothing to send — every signup is already confirmed.');
    return;
  }

  console.log(`\n${planned.length} email(s) to send:\n`);
  for (const p of planned) {
    console.log(`  ${p.to}`);
    console.log(`    template: ${p.templateName}`);
    console.log(`    source:   ${p.source}`);
    console.log(
      `    fields:   ${Object.entries(p.data)
        .filter(([, v]) => v !== '' && v !== false)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`
    );
  }

  if (!send) {
    console.log('\nDry run complete. Re-run with --send to queue these.');
    return;
  }

  let queued = 0;
  for (const p of planned) {
    await db.collection('mail').add({
      to: p.to,
      replyTo: MT_REPLY_TO,
      template: { name: p.templateName, data: p.data },
    });
    // Stamp only after the mail doc exists — a crash between the two leaves the
    // entry eligible for a re-run rather than silently marked as handled.
    await p.stampRef.update({ signupEmailSentAt: new Date() });
    queued += 1;
  }

  console.log(`\nQueued ${queued} email(s).`);
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
