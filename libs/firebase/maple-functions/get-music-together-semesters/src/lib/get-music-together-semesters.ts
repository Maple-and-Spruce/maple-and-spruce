/**
 * Get Music Together Semesters Cloud Function
 *
 * Lists Music Together semesters (terms of the program year) for the admin
 * app (authenticated). Optional status filter; returned in chronological
 * program-year order. Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import { MusicTogetherSemesterRepository } from '@maple/firebase/database';
import type {
  GetMusicTogetherSemestersRequest,
  GetMusicTogetherSemestersResponse,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherSemesters = createAuthenticatedFunction<
  GetMusicTogetherSemestersRequest,
  GetMusicTogetherSemestersResponse
>(async (data) => {
  const semesters = await MusicTogetherSemesterRepository.findAll({
    status: data.status,
  });
  return { semesters };
});
