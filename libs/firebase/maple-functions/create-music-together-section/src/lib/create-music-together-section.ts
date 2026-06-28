/**
 * Create Music Together Section Cloud Function (admin)
 *
 * Creates a new Music Together section (one term of the program). Validates
 * with the shared Vest suite. Deployed to us-east4 via CI/CD (maple-core).
 */
import { Functions, Role } from '@maple/firebase/functions';
import { MusicTogetherSectionRepository } from '@maple/firebase/database';
import { musicTogetherSectionValidation } from '@maple/ts/validation';
import type {
  CreateMusicTogetherSectionRequest,
  CreateMusicTogetherSectionResponse,
} from '@maple/ts/firebase/api-types';

export const createMusicTogetherSection = Functions.endpoint
  .requiringRole(Role.Admin)
  .validating(musicTogetherSectionValidation)
  .handle<
    CreateMusicTogetherSectionRequest,
    CreateMusicTogetherSectionResponse
  >(async (data) => {
    const section = await MusicTogetherSectionRepository.create(data);
    return { section };
  });
