/**
 * Get Music Together Semesters Cloud Function
 *
 * Lists Music Together semesters (terms of the program year) for the admin
 * app (authenticated), in chronological program-year order. The overall status
 * is DERIVED client-side from each term's dates. Deployed to us-east4 via CI/CD
 * (maple-core codebase).
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { MusicTogetherSemesterRepository } from '@maple/firebase/database';
import type {
  GetMusicTogetherSemestersRequest,
  GetMusicTogetherSemestersResponse,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherSemesters = createRoleFunction<
  GetMusicTogetherSemestersRequest,
  GetMusicTogetherSemestersResponse
>(async () => {
  const semesters = await MusicTogetherSemesterRepository.findAll();
  return { semesters };
}, [Role.Admin, Role.MtTeacher]);
