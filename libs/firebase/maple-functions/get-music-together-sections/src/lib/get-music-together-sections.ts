/**
 * Get Music Together Sections Cloud Function
 *
 * Lists Music Together sections for the admin app (authenticated). Optional
 * status filter. Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import { MusicTogetherSectionRepository } from '@maple/firebase/database';
import type {
  GetMusicTogetherSectionsRequest,
  GetMusicTogetherSectionsResponse,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherSections = createAuthenticatedFunction<
  GetMusicTogetherSectionsRequest,
  GetMusicTogetherSectionsResponse
>(async (data) => {
  const sections = await MusicTogetherSectionRepository.findAll({
    status: data.status,
  });
  return { sections };
});
