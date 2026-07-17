/**
 * Create Music Together Semester Cloud Function (admin)
 *
 * Creates a new Music Together semester (one term of the program year).
 * Validates with the shared Vest suite. Deployed to us-east4 via CI/CD
 * (maple-core).
 */
import { Functions, Role } from '@maple/firebase/functions';
import { MusicTogetherSemesterRepository } from '@maple/firebase/database';
import { musicTogetherSemesterValidation } from '@maple/ts/validation';
import type {
  CreateMusicTogetherSemesterRequest,
  CreateMusicTogetherSemesterResponse,
} from '@maple/ts/firebase/api-types';

export const createMusicTogetherSemester = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .validating(musicTogetherSemesterValidation)
  .handle<
    CreateMusicTogetherSemesterRequest,
    CreateMusicTogetherSemesterResponse
  >(async (data) => {
    const semester = await MusicTogetherSemesterRepository.create(data);
    return { semester };
  });
