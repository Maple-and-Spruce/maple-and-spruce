/**
 * Add to Music Together Waitlist Cloud Function
 *
 * Public (no auth) endpoint the checkout widget calls when a section is full.
 * Captures the family's name, email, and availability under
 * `musicTogetherSections/{sectionId}/waitlist/{emailKey}`. Idempotent — a
 * repeat signup with the same email returns `added: false` and keeps the
 * family's place in line.
 *
 * The section must exist and not be a draft; beyond that there is no capacity
 * gate (a family may want to be waitlisted even before a section fills).
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  Functions,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
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
    if (section.status === 'draft') {
      throwInvalidArgument(
        'This section is not available for waitlist signup'
      );
    }

    const { created } = await MusicTogetherWaitlistRepository.add({
      sectionId: data.sectionId,
      name: data.name,
      email: data.email,
      availability: data.availability,
    });

    return { added: created };
  });
