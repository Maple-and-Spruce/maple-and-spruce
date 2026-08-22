/**
 * Add Music Together Interest Cloud Function
 *
 * Public (no auth) endpoint for the cross-section interest form. A family joins
 * a single interest list, checks off any current sections they'd take, and
 * leaves preference / alternate-time / notes free text. Works even when nothing
 * is full — it exists to gauge demand and guide adding sections.
 *
 * Idempotent per email: a repeat submission UPDATES the family's selections and
 * notes (returning `added: false`) rather than creating a duplicate. Any
 * referenced section must exist and be publicly visible; the entry is otherwise
 * ungated (no capacity/enrollment check — demand can be gathered pre-launch).
 *
 * A server-side Meta `Lead` (Conversions API) is sent for a NEW entry, keyed to
 * the same `event_id` the browser Pixel uses so the pair deduplicates. See the
 * note at the send site for why it is inline rather than a Firestore trigger.
 *
 * Validation runs BEFORE any write. Deployed to us-east4 (maple-core codebase).
 */
import {
  Functions,
  throwInvalidArgument,
  throwValidationError,
} from '@maple/firebase/functions';
import {
  MusicTogetherSectionRepository,
  MusicTogetherInterestRepository,
} from '@maple/firebase/database';
import { musicTogetherInterestValidation } from '@maple/ts/validation';
import type {
  AddMusicTogetherInterestRequest,
  AddMusicTogetherInterestResponse,
} from '@maple/ts/firebase/api-types';
import { defineString } from 'firebase-functions/params';
import {
  buildMusicTogetherInterestEvent,
  musicTogetherInterestEventId,
  splitName,
  trySendMetaCapiEvents,
  MT_TOP_FUNNEL_CAPI_TIMEOUT_MS,
} from '@maple/firebase/meta-capi';

// The Music Together pixel, NOT `META_PIXEL_ID`. Declared identically in
// `add-music-together-demo-rsvp.ts` / `send-music-together-conversion.ts` —
// duplicate declarations in one bundle are fine, mismatched defaults are not.
const metaPixelId = defineString('META_PIXEL_ID_MUSIC_TOGETHER', {
  default: '1562555242035326',
});
const metaCapiBaseUrl = defineString('META_CAPI_BASE_URL', {
  default: 'https://graph.facebook.com',
});
const metaCapiApiVersion = defineString('META_CAPI_API_VERSION', {
  default: 'v20.0',
});

export const addMusicTogetherInterest = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .usingSecrets('META_CAPI_TOKEN')
  .handle<AddMusicTogetherInterestRequest, AddMusicTogetherInterestResponse>(
    async (data, context, secrets) => {
      const interestedSectionIds = data.interestedSectionIds ?? [];

      const result = musicTogetherInterestValidation({
        name: data.name,
        email: data.email,
        interestedSectionIds,
        preferenceNote: data.preferenceNote,
        alternateTimesNote: data.alternateTimesNote,
        notes: data.notes,
      });
      if (result.hasErrors()) {
        throwValidationError(result.getErrors());
      }

      // Reject unknown / hidden sections so the demand list stays trustworthy.
      // De-dupe first so a family can't inflate a section's tally.
      const uniqueSectionIds = [...new Set(interestedSectionIds)];
      for (const sectionId of uniqueSectionIds) {
        const section = await MusicTogetherSectionRepository.findById(
          sectionId
        );
        if (!section || !section.visible) {
          throwInvalidArgument(
            `Section is not available for interest signup: ${sectionId}`
          );
        }
      }

      // `context.ip` / `context.userAgent` come off the HTTP request, not the
      // payload, so they cannot be spoofed into another family's attribution.
      const attribution = {
        fbp: data.metaAttribution?.fbp,
        fbc: data.metaAttribution?.fbc,
        eventSourceUrl: data.metaAttribution?.eventSourceUrl,
        clientIp: context.ip,
        clientUserAgent: context.userAgent,
      };

      const { created } = await MusicTogetherInterestRepository.upsert(
        {
          name: data.name,
          email: data.email,
          interestedSectionIds: uniqueSectionIds,
          preferenceNote: data.preferenceNote,
          alternateTimesNote: data.alternateTimesNote,
          notes: data.notes,
        },
        attribution
      );

      // Meta `Lead`, server-side. Inline for the same reasons as the demo RSVP
      // (see `add-music-together-demo-rsvp.ts`): the conversion is this
      // request, the browser needs the `event_id` in this response, and a
      // Firestore trigger would cost a Cloud Run service against the ADR-029
      // ratchet for no behavioral gain.
      //
      // Only on `created`. This upsert is idempotent per email, so a family
      // refining their section picks re-enters here — that is engagement, not
      // new demand, and counting it would let a public endpoint inflate the
      // campaign's `Lead` total on replay. The browser half still fires on a
      // re-submit (unchanged behavior) with this same id, which is exactly what
      // keeps Meta from booking it twice inside the dedup window.
      //
      // Keyed off the validated request, not the stored entry — `mtEmailKey`
      // normalizes both identically and the request is always populated.
      const eventId = musicTogetherInterestEventId(data.email);
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
              buildMusicTogetherInterestEvent({
                email: data.email,
                firstName,
                lastName,
                interestedSectionIds: uniqueSectionIds,
                ...attribution,
              }),
            ]
          );
        } catch (capiError) {
          // See `add-music-together-demo-rsvp.ts`: the signup is already
          // written, and a marketing beacon must never fail it.
          console.error(
            `[addMusicTogetherInterest] Meta CAPI Lead failed (signup unaffected):`,
            capiError
          );
        }
      }

      return { added: created, eventId };
    }
  );
