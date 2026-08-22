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
 * A server-side Meta `Schedule` (Conversions API) is sent on the same NEW-RSVP
 * path, for the same reason the email is: the browser Pixel is the only signal
 * today, and ad blockers plus Safari ITP eat an unknown share of it. See the
 * inline note at the send site for why this is inline rather than a Firestore
 * trigger, and `libs/firebase/meta-capi/src/lib/music-together-top-funnel.ts`
 * for the shared `event_id` the browser half reuses.
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
import { defineString } from 'firebase-functions/params';
import {
  buildMusicTogetherDemoRsvpEvent,
  musicTogetherDemoRsvpEventId,
  splitName,
  trySendMetaCapiEvents,
  MT_TOP_FUNNEL_CAPI_TIMEOUT_MS,
} from '@maple/firebase/meta-capi';

// The Music Together pixel, NOT `META_PIXEL_ID` — MT advertises from its own
// ad account. Keep the default in sync with `MUSIC_TOGETHER_PIXEL_ID` in
// apps/webflow-components/src/lib/meta-pixels.ts, or the browser and server
// halves land in different datasets and stop deduplicating.
//
// These three params are declared identically in `send-music-together-
// conversion.ts` and `tally-lead-webhook.ts`; a duplicate declaration in one
// bundle is fine, a MISMATCHED default is not. All three also have entries in
// .env.dev / .env.prod, which is what stops deploy-time discovery prompting
// for them on stdin.
const metaPixelId = defineString('META_PIXEL_ID_MUSIC_TOGETHER', {
  default: '1562555242035326',
});
const metaCapiBaseUrl = defineString('META_CAPI_BASE_URL', {
  default: 'https://graph.facebook.com',
});
const metaCapiApiVersion = defineString('META_CAPI_API_VERSION', {
  default: 'v20.0',
});

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
  .usingSecrets('META_CAPI_TOKEN')
  .handle<AddMusicTogetherDemoRsvpRequest, AddMusicTogetherDemoRsvpResponse>(
    async (data, context, secrets) => {
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

      // Client-supplied cookies plus the two fields only the SERVER can know
      // (`context.ip` / `context.userAgent` come off the HTTP request, never
      // off the payload — a caller cannot spoof them into someone else's
      // attribution).
      const attribution = {
        fbp: data.metaAttribution?.fbp,
        fbc: data.metaAttribution?.fbc,
        eventSourceUrl: data.metaAttribution?.eventSourceUrl,
        clientIp: context.ip,
        clientUserAgent: context.userAgent,
      };

      const { entry, created } = await MusicTogetherDemoRsvpRepository.add(
        {
          demoId: data.demoId,
          name: data.name,
          email: data.email,
          capacityFamilies: demo.capacityFamilies,
        },
        attribution
      );

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

      // Meta `Schedule`, server-side.
      //
      // WHY INLINE, and not a Firestore trigger like `sendMusicTogetherConversion`:
      // the conversion here IS this request. There is no later status flip for
      // a trigger to watch (an RSVP is born final), the browser half needs the
      // `event_id` in THIS response, and a trigger would be a whole extra Cloud
      // Run service against the ADR-029 deploy-write ratchet for no behavioral
      // gain. `tallyLeadWebhook` — the other top-of-funnel lead, likewise
      // captured in a single public request — already sends CAPI inline for
      // exactly these reasons.
      //
      // Cost is bounded on both sides: `MT_TOP_FUNNEL_CAPI_TIMEOUT_MS` caps the
      // wait, and `trySendMetaCapiEvents` never throws, so the worst a broken
      // Meta can do is add two seconds and drop one attribution event. The seat
      // is already committed by the time we get here.
      //
      // Only on `created`: this endpoint is public and unauthenticated, so
      // firing on every call would let anyone inflate a campaign's conversion
      // count by replaying an RSVP. A repeat RSVP is not a new conversion.
      //
      // Keyed off the VALIDATED REQUEST values rather than the stored entry:
      // `mtEmailKey` normalizes both to the same string, and the request is the
      // one input guaranteed to be populated on every path (a repeat RSVP
      // echoes back a document we did not just write).
      const eventId = musicTogetherDemoRsvpEventId(data.demoId, data.email);
      if (created) {
        try {
          const { firstName, lastName } = splitName(data.name);
          await trySendMetaCapiEvents(
            {
              baseUrl: metaCapiBaseUrl.value(),
              apiVersion: metaCapiApiVersion.value(),
              pixelId: metaPixelId.value(),
              accessToken: secrets['META_CAPI_TOKEN'],
              timeoutMs: MT_TOP_FUNNEL_CAPI_TIMEOUT_MS,
            },
            [
              buildMusicTogetherDemoRsvpEvent({
                demoId: data.demoId,
                email: data.email,
                firstName,
                lastName,
                demoDateTime: demo.dateTime.toISOString(),
                rsvpStatus: entry.status,
                ...attribution,
              }),
            ]
          );
        } catch (capiError) {
          // `trySendMetaCapiEvents` already swallows Meta's own failures; this
          // is the belt on top of those braces, so the guarantee — an RSVP is
          // NEVER failed by a marketing beacon — is enforced at the call site
          // instead of inherited from another module's internals.
          console.error(
            `[addMusicTogetherDemoRsvp] Meta CAPI Schedule failed for demo ${data.demoId} (RSVP unaffected):`,
            capiError
          );
        }
      }

      return { added: created, status: entry.status, eventId };
    }
  );
