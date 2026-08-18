/**
 * Add Music Together Demo RSVP Cloud Function
 *
 * Public (no auth) endpoint the demo-class RSVP widget calls when a family
 * reserves a spot at a FREE Music Together demo. Takes the chosen `demoId` plus
 * name + email. Looks up the demo (must exist and be visible), then reserves a
 * spot in a capacity-gated transaction: `confirmed` while under the demo's
 * family cap, otherwise `waitlisted`.
 *
 * Idempotent per (demo, email): a repeat RSVP returns the family's existing
 * status with `added: false`. Demos are free — no payment, no Square.
 *
 * On a NEW RSVP the family is emailed a confirmation (or a waitlist notice, if
 * the demo was already at capacity). Two things to keep in mind about that:
 *
 *   1. Mail is queued ONLY when `created` is true. This endpoint is public and
 *      unauthenticated, so emailing on every call would let anyone mailbomb an
 *      arbitrary address by replaying the same RSVP. The per-(demo, email)
 *      idempotency is what makes sending safe here.
 *   2. A mail failure must NOT fail the RSVP — the seat is already committed by
 *      the time we send, and throwing would tell the family their RSVP didn't
 *      take when it did. Failures are logged and left for the backfill
 *      (`tools/backfill-mt-signup-emails.ts`, which keys off `signupEmailSentAt`).
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  Functions,
  throwValidationError,
  throwNotFound,
  throwFailedPrecondition,
  queueMail,
} from '@maple/firebase/functions';
import {
  MusicTogetherDemoRepository,
  MusicTogetherDemoRsvpRepository,
} from '@maple/firebase/database';
import { musicTogetherDemoRsvpValidation } from '@maple/ts/validation';
import type {
  AddMusicTogetherDemoRsvpRequest,
  AddMusicTogetherDemoRsvpResponse,
} from '@maple/ts/firebase/api-types';
import {
  MT_DEMO_TITLE,
  type MusicTogetherDemo,
  type MusicTogetherDemoRsvp,
} from '@maple/ts/domain';

const TIMEZONE = 'America/New_York';

/**
 * Template data shared by the confirmed and waitlisted RSVP emails, and by the
 * backfill. Exported so `tools/backfill-mt-signup-emails.ts` renders the exact
 * same fields rather than drifting its own copy.
 *
 * `demoLocation` is always the demo's own address. Demos are regularly held
 * offsite (a public library, a partner space), so this must never fall back to
 * the Beulah Road studio — a family sent to the wrong building is a worse
 * outcome than no email at all.
 *
 * There is no child name here: the RSVP form collects a family name and email
 * only, so the demo copy says "your little one" rather than merging a name.
 */
export function demoRsvpTemplateData(
  demo: Pick<MusicTogetherDemo, 'dateTime' | 'location'>,
  rsvp: Pick<MusicTogetherDemoRsvp, 'name'>
): Record<string, string> {
  return {
    caregiverName: rsvp.name,
    demoTitle: MT_DEMO_TITLE,
    demoDate: demo.dateTime.toLocaleDateString('en-US', {
      timeZone: TIMEZONE,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    demoDay: demo.dateTime.toLocaleDateString('en-US', {
      timeZone: TIMEZONE,
      weekday: 'long',
    }),
    demoTime: demo.dateTime.toLocaleTimeString('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
    }),
    demoLocation: demo.location,
  };
}

/** Template id per RSVP outcome. */
export function demoRsvpTemplateName(status: 'confirmed' | 'waitlisted'): string {
  return status === 'confirmed'
    ? 'music-together-demo-rsvp-confirmed'
    : 'music-together-demo-rsvp-waitlisted';
}

export const addMusicTogetherDemoRsvp = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .handle<AddMusicTogetherDemoRsvpRequest, AddMusicTogetherDemoRsvpResponse>(
    async (data) => {
      const result = musicTogetherDemoRsvpValidation({
        demoId: data.demoId,
        name: data.name,
        email: data.email,
      });
      if (result.hasErrors()) {
        throwValidationError(result.getErrors());
      }

      // The demo must exist and be publicly visible to accept RSVPs.
      const demo = await MusicTogetherDemoRepository.findById(data.demoId);
      if (!demo) {
        throwNotFound('Music Together demo', data.demoId);
      }
      if (!demo.visible) {
        throwFailedPrecondition('This demo is not open for RSVPs.');
      }

      const { entry, created } = await MusicTogetherDemoRsvpRepository.add({
        demoId: data.demoId,
        name: data.name,
        email: data.email,
        capacityFamilies: demo.capacityFamilies,
      });

      if (created) {
        try {
          const queued = await queueMail({
            to: entry.email,
            templateName: demoRsvpTemplateName(entry.status),
            data: demoRsvpTemplateData(demo, entry),
            sender: 'music-together',
          });
          if (queued) {
            await MusicTogetherDemoRsvpRepository.markSignupEmailSent(
              entry.demoId,
              entry.email,
              new Date()
            );
          }
        } catch (mailError) {
          // The seat is already reserved — never fail the RSVP over email.
          console.error(
            `[addMusicTogetherDemoRsvp] Failed to queue ${entry.status} email for ${entry.email} on demo ${entry.demoId}:`,
            mailError
          );
        }
      }

      return { added: created, status: entry.status };
    }
  );
