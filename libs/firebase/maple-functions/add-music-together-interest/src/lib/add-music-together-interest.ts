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

export const addMusicTogetherInterest = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .handle<AddMusicTogetherInterestRequest, AddMusicTogetherInterestResponse>(
    async (data) => {
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

      const { created } = await MusicTogetherInterestRepository.upsert({
        name: data.name,
        email: data.email,
        interestedSectionIds: uniqueSectionIds,
        preferenceNote: data.preferenceNote,
        alternateTimesNote: data.alternateTimesNote,
        notes: data.notes,
      });

      return { added: created };
    }
  );
