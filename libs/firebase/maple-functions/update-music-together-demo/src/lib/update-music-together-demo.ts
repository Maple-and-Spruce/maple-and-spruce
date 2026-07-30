/**
 * Update Music Together Demo Cloud Function (admin)
 *
 * Updates an existing demo class. Validates only the changed fields against the
 * merged record (partial-edit pattern). Gated to Admin + MtTeacher. Deployed to
 * us-east4 via CI/CD (maple-core).
 */
import {
  createRoleFunction,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
  Role,
} from '@maple/firebase/functions';
import { MusicTogetherDemoRepository } from '@maple/firebase/database';
import { musicTogetherDemoValidation } from '@maple/ts/validation';
import type {
  UpdateMusicTogetherDemoRequest,
  UpdateMusicTogetherDemoResponse,
} from '@maple/ts/firebase/api-types';

export const updateMusicTogetherDemo = createRoleFunction<
  UpdateMusicTogetherDemoRequest,
  UpdateMusicTogetherDemoResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Demo ID is required');

  const existing = await MusicTogetherDemoRepository.findById(data.id);
  if (!existing) throwNotFound('Music Together demo', data.id);

  const fields = Object.keys(data).filter((key) => key !== 'id');
  if (fields.length > 0) {
    const result = musicTogetherDemoValidation({ ...existing, ...data }, fields);
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

  const demo = await MusicTogetherDemoRepository.update(data);
  return { demo };
}, [Role.Admin, Role.MtTeacher]);
