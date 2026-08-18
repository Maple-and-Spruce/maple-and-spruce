/**
 * Add to Music Together Waitlist Cloud Function
 *
 * Public (no auth) endpoint the checkout widget calls when a section is full.
 * Captures the family's name, email, and availability under
 * `musicTogetherSections/{sectionId}/waitlist/{emailKey}`. Idempotent — a
 * repeat signup with the same email returns `added: false` and keeps the
 * family's place in line.
 *
 * The section must exist and be publicly visible; beyond that there is no
 * capacity gate (a family may want to be waitlisted even before a section fills).
 *
 * A NEW signup is acknowledged by email so the family knows they're on the list
 * and roughly what happens next. Two constraints shape that:
 *
 *   1. Mail is queued ONLY when `created` is true. This endpoint is public and
 *      unauthenticated, so emailing on every call would let anyone mailbomb an
 *      arbitrary address by replaying the same signup. The per-(section, email)
 *      idempotency is what makes sending safe here.
 *   2. A mail failure must NOT fail the signup — the family's place in line is
 *      already committed. Failures are logged and left for the backfill
 *      (`tools/backfill-mt-signup-emails.ts`, keyed off `signupEmailSentAt`).
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  Functions,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
  queueMail,
} from '@maple/firebase/functions';
import {
  MusicTogetherSectionRepository,
  MusicTogetherWaitlistRepository,
} from '@maple/firebase/database';
import { musicTogetherWaitlistValidation } from '@maple/ts/validation';
import type {
  AddToMusicTogetherWaitlistRequest,
  AddToMusicTogetherWaitlistResponse,
} from '@maple/ts/firebase/api-types';
import type {
  MusicTogetherSection,
  MusicTogetherWaitlistEntry,
} from '@maple/ts/domain';

export const MT_WAITLIST_TEMPLATE = 'music-together-waitlist-confirmation';

/**
 * Template data for the waitlist acknowledgement. Exported so
 * `tools/backfill-mt-signup-emails.ts` renders the same fields.
 *
 * `name` and `availability` are both optional on the entry — the section page
 * also runs an email-only "coming soon" capture — so the template greets
 * generically and omits the availability line when they're absent.
 */
export function waitlistTemplateData(
  section: Pick<MusicTogetherSection, 'name'>,
  entry: Pick<MusicTogetherWaitlistEntry, 'name' | 'availability'>
): Record<string, string> {
  return {
    name: entry.name ?? '',
    sectionName: section.name,
    availability: entry.availability ?? '',
  };
}

export const addToMusicTogetherWaitlist = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .handle<
    AddToMusicTogetherWaitlistRequest,
    AddToMusicTogetherWaitlistResponse
  >(async (data) => {
    const result = musicTogetherWaitlistValidation({
      sectionId: data.sectionId,
      name: data.name,
      email: data.email,
      availability: data.availability,
    });
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }

    const section = await MusicTogetherSectionRepository.findById(
      data.sectionId
    );
    if (!section) {
      throwNotFound('Music Together section', data.sectionId);
    }
    if (!section.visible) {
      throwInvalidArgument(
        'This section is not available for waitlist signup'
      );
    }

    const { entry, created } = await MusicTogetherWaitlistRepository.add({
      sectionId: data.sectionId,
      name: data.name,
      email: data.email,
      availability: data.availability,
    });

    if (created) {
      try {
        const queued = await queueMail({
          to: entry.email,
          templateName: MT_WAITLIST_TEMPLATE,
          data: waitlistTemplateData(section, entry),
          sender: 'music-together',
        });
        if (queued) {
          await MusicTogetherWaitlistRepository.markSignupEmailSent(
            entry.sectionId,
            entry.email,
            new Date()
          );
        }
      } catch (mailError) {
        // The family is already on the list — never fail the signup over email.
        console.error(
          `[addToMusicTogetherWaitlist] Failed to queue waitlist email for ${entry.email} on section ${entry.sectionId}:`,
          mailError
        );
      }
    }

    return { added: created };
  });
