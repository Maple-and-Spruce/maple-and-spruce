/**
 * syncLessonInquiries — pull music lesson inquiries from Tally into the portal (#795)
 *
 * WHY A SCHEDULED POLL AND NOT A WEBHOOK
 * --------------------------------------
 * `tallyLeadWebhook` already receives every submission. Persisting from there
 * was the obvious design and is the wrong one, for three reasons:
 *
 * 1. **The webhook is one-shot.** Tally hangs up at 10s and does not retry
 *    automatically; a delivery that fails is a permanently lost lead unless a
 *    human replays it from the events log. Analytics has to live with that
 *    because a conversion event is worthless late. A lead record does not —
 *    it just has to be *right*, and a poll that fails is corrected by the next
 *    poll, for free.
 * 2. **It would re-inflate `maple-webhooks`.** That codebase is ~90kb / ~2.6s
 *    cold precisely so the unretryable path has the widest possible margin
 *    (ADR-031). Adding firebase-admin repositories to it would push every
 *    webhook in it toward the cliff to buy persistence it does not need.
 * 3. **A webhook cannot go back.** Fourteen inquiries were already sitting in
 *    the shared `dWPQOr` form when this was written, none of them ever in the
 *    portal, plus anything submitted before the wiring was done. Polling
 *    backfills all of it on the first run.
 *
 * The cost is latency: an inquiry appears within the schedule interval rather
 * than instantly. For a queue two people work through between lessons, that is
 * not a cost at all. Analytics stays instant and unretryable; persistence
 * becomes slow and reliable. Splitting them by *mechanism* rather than by
 * bundle is what dissolves the codebase question entirely — this runs on a
 * schedule, so cold start is irrelevant and it lives happily in `maple-core`.
 *
 * IDEMPOTENCE, AND WHY IT IS BY OWNERSHIP RATHER THAN BY AGE
 * ----------------------------------------------------------
 * The Firestore document id is the Tally submission id, and a new inquiry is
 * written with `create()`, not `set()`, so two concurrent runs cannot both
 * create it.
 *
 * "Already stored" originally meant "never touch again". That protected the
 * statuses — a run must never reset an `enrolled` lead Katie has worked back
 * to `new` — but it also froze bugs. When a mapping defect stored
 * `contactName: "Unknown"` on all 14 leads, fixing the mapper could not reach
 * them; the only route left was to delete and re-ingest, discarding the
 * statuses along with the bug.
 *
 * So the document is split by writer instead. Tally owns the answers and a run
 * will rewrite them when they drift (`refreshIngestedFields`); the portal owns
 * `status`, `studentId` and `followUpNote` and a run never writes them at all.
 * The drift check is what keeps this from becoming a busy loop: a row that
 * already matches is not written, so the steady state is still zero writes.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { Functions, Role } from '@maple/firebase/functions';
import { LessonInquiryRepository } from '@maple/firebase/database';
import { ingestedFieldsMatch, mapSubmission } from './map-submission';
import { fetchAllSubmissions } from './tally-client';

const tallyApiKey = defineSecret('TALLY_API_KEY');

const tallyApiBaseUrl = defineString('TALLY_API_BASE_URL', {
  default: 'https://api.tally.so',
});

/**
 * Both lesson funnels: the Suzuki form from `/suzuki` and the older shared form
 * still serving `/music` and `/music-lessons`. A comma-separated string param
 * rather than code so a new form can be captured without a deploy.
 */
const lessonInquiryFormIds = defineString('TALLY_LESSON_INQUIRY_FORM_IDS', {
  default: 'QKQb6k,dWPQOr',
});

const TIMEZONE = 'America/New_York';

export interface SyncLessonInquiriesResult {
  /** Submissions read from Tally across all forms. */
  seen: number;
  /** New inquiries written. */
  created: number;
  /** Already stored and already correct — the steady-state case. */
  skipped: number;
  /** Already stored, but the ingested answers had drifted and were rewritten. */
  repaired: number;
  /** Submissions that could not become a lead (no id, no email, partial). */
  unmappable: number;
  /** Forms that errored. One bad form must not stop the others. */
  failedForms: string[];
}

export function parseFormIds(raw: string): string[] {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Core logic, exported so the admin-callable twin and the integration tests can
 * drive it. `onSchedule` triggers are not reachable over HTTP in the Firebase
 * emulator — the same reason `chargeMusicTogetherInstallments` and
 * `sendMusicTogetherReminders` each ship a callable alongside the schedule.
 */
export async function runSyncLessonInquiries(
  config: { baseUrl: string; apiKey: string; formIds: string[] },
  now: Date = new Date()
): Promise<SyncLessonInquiriesResult> {
  const result: SyncLessonInquiriesResult = {
    seen: 0,
    created: 0,
    skipped: 0,
    repaired: 0,
    unmappable: 0,
    failedForms: [],
  };

  // No forms configured is a deliberate state, not a misconfiguration: dev
  // sets TALLY_LESSON_INQUIRY_FORM_IDS empty so it never ingests production
  // lesson inquiries (there is one Tally workspace, so every real form id is a
  // production form — see .env.dev). Return before touching Firestore; without
  // this the schedule would do a full read of the inquiry collection every 15
  // minutes to answer a question it has no forms to ask.
  if (config.formIds.length === 0) {
    console.log(
      '[syncLessonInquiries] No form ids configured — nothing to ingest.'
    );
    return result;
  }

  // One read of the stored inquiries serves every form: it short-circuits the
  // page walk, avoids a per-submission existence check, and gives the repair
  // pass something to compare against.
  const stored = await LessonInquiryRepository.findAllBySubmissionId();

  for (const formId of config.formIds) {
    try {
      const { questions, submissions } = await fetchAllSubmissions(
        { baseUrl: config.baseUrl, apiKey: config.apiKey },
        formId,
        // Submissions come back newest-first, so a page on which every id is
        // stored *and already correct* means everything older is too. The
        // first run never hits this and walks the whole history, which is the
        // backfill; a run after a mapping fix keeps walking past rows that are
        // merely present, which is what lets the repair reach page 2 and
        // beyond rather than stopping at the newest already-known lead.
        (page) =>
          page.submissions.length > 0 &&
          page.submissions.every((s) => {
            if (!s.id) return false;
            const existing = stored.get(s.id);
            if (!existing) return false;
            const mapped = mapSubmission(s, questions, formId, now);
            return mapped !== null && ingestedFieldsMatch(existing, mapped);
          })
      );

      for (const submission of submissions) {
        result.seen++;

        const mapped = mapSubmission(submission, questions, formId, now);
        if (!mapped) {
          result.unmappable++;
          continue;
        }

        const existing = submission.id ? stored.get(submission.id) : undefined;
        if (existing) {
          // Present already. Rewrite only if what Tally says has drifted from
          // what we stored — the guard is what keeps the steady state at zero
          // writes, and what stops this and the portal fighting over the row.
          if (ingestedFieldsMatch(existing, mapped)) {
            result.skipped++;
            continue;
          }
          const refreshed =
            await LessonInquiryRepository.refreshIngestedFields(mapped);
          if (refreshed) stored.set(mapped.id, refreshed);
          result.repaired++;
          continue;
        }

        const created = await LessonInquiryRepository.createIfAbsent(mapped);
        if (created) {
          result.created++;
          stored.set(mapped.id, created);
        } else {
          // Lost a race with a concurrent run. Benign by construction.
          result.skipped++;
        }
      }
    } catch (error) {
      // A form that 404s or a rotated key must not cost us the other form's
      // leads, and must not fail the scheduled run into a retry storm.
      result.failedForms.push(formId);
      console.error(
        `[lesson-inquiries] form ${formId} failed:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(
    `[lesson-inquiries] seen ${result.seen}, created ${result.created}, ` +
      `skipped ${result.skipped}, repaired ${result.repaired}, ` +
      `unmappable ${result.unmappable}` +
      (result.failedForms.length > 0
        ? `, failed forms: ${result.failedForms.join(', ')}`
        : '')
  );

  return result;
}

function currentConfig() {
  return {
    baseUrl: tallyApiBaseUrl.value(),
    apiKey: tallyApiKey.value(),
    formIds: parseFormIds(lessonInquiryFormIds.value()),
  };
}

const TALLY_SECRET_NAMES = ['TALLY_API_KEY'] as const;
const TALLY_STRING_NAMES = [
  'TALLY_API_BASE_URL',
  'TALLY_LESSON_INQUIRY_FORM_IDS',
] as const;

/**
 * Every 15 minutes. Fast enough that a family who fills the form and calls the
 * shop is already on the screen when someone looks, slow enough to be
 * invisible against Tally's 100 requests/minute limit (96 requests a day).
 */
export const syncLessonInquiries = onSchedule(
  {
    schedule: '*/15 * * * *',
    timeZone: TIMEZONE,
    region: 'us-east4',
    secrets: [tallyApiKey],
  },
  async () => {
    await runSyncLessonInquiries(currentConfig(), new Date());
  }
);

/** Admin-callable twin — same logic on demand, and what the integration tests drive. */
export const triggerLessonInquirySync = Functions.endpoint
  .usingSecrets(...TALLY_SECRET_NAMES)
  .usingStrings(...TALLY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<Record<string, never>, SyncLessonInquiriesResult>(
    async (_data, _context, secrets, strings) => {
      return runSyncLessonInquiries(
        {
          // The builder resolves secrets and strings before the handler runs,
          // so these are plain values, not params.
          baseUrl: strings.TALLY_API_BASE_URL,
          apiKey: secrets.TALLY_API_KEY,
          formIds: parseFormIds(strings.TALLY_LESSON_INQUIRY_FORM_IDS),
        },
        new Date()
      );
    }
  );
