/**
 * Create Music Together Demo Cloud Function (admin)
 *
 * Creates a new Music Together demo class (free, dated, capacity-gated
 * try-a-class at a free-text location). Validates with the shared Vest suite.
 * Gated to Admin + MtTeacher. Deployed to us-east4 via CI/CD (maple-core).
 */
import { Functions, Role } from '@maple/firebase/functions';
import { MusicTogetherDemoRepository } from '@maple/firebase/database';
import { musicTogetherDemoValidation } from '@maple/ts/validation';
import type {
  CreateMusicTogetherDemoRequest,
  CreateMusicTogetherDemoResponse,
} from '@maple/ts/firebase/api-types';

export const createMusicTogetherDemo = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .validating(musicTogetherDemoValidation)
  .handle<CreateMusicTogetherDemoRequest, CreateMusicTogetherDemoResponse>(
    async (data) => {
      const demo = await MusicTogetherDemoRepository.create(data);
      return { demo };
    }
  );
