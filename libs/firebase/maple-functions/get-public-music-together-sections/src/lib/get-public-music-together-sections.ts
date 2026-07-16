/**
 * Get Public Music Together Sections Cloud Function
 *
 * Public (no auth) list of customer-safe section options — id, display name,
 * first-session time, location and derived status — used to render the
 * cross-section interest form's checkboxes. Only publicly visible sections are
 * returned. Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { Functions } from '@maple/firebase/functions';
import { MusicTogetherSectionRepository } from '@maple/firebase/database';
import {
  mtSectionFirstSessionAt,
  mtSectionDerivedStatus,
} from '@maple/ts/domain';
import type {
  GetPublicMusicTogetherSectionsRequest,
  GetPublicMusicTogetherSectionsResponse,
  PublicMusicTogetherSectionOption,
} from '@maple/ts/firebase/api-types';

export const getPublicMusicTogetherSections = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .handle<
    GetPublicMusicTogetherSectionsRequest,
    GetPublicMusicTogetherSectionsResponse
  >(async (data) => {
    const sections = await MusicTogetherSectionRepository.findAll({
      semesterId: data.semesterId,
    });

    const now = new Date();
    const options: PublicMusicTogetherSectionOption[] = sections
      // Hide drafts — only sections shown to the public can be picked.
      .filter((section) => section.visible)
      .map((section) => {
        const firstSessionAt = mtSectionFirstSessionAt(section);
        return {
          id: section.id,
          name: section.name,
          firstSessionAt: firstSessionAt?.toISOString(),
          location: section.location,
          status: mtSectionDerivedStatus(section, now),
        };
      });

    return { sections: options };
  });
