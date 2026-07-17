/**
 * Update Music Together Section Cloud Function (admin)
 *
 * Updates an existing section. Validates the merged record so partial edits
 * are checked against the full shape. Deployed to us-east4 via CI/CD (maple-core).
 */
import {
  createRoleFunction,
  throwNotFound,
  Role,
} from '@maple/firebase/functions';
import { MusicTogetherSectionRepository } from '@maple/firebase/database';
import { musicTogetherSectionValidation } from '@maple/ts/validation';
import type {
  UpdateMusicTogetherSectionRequest,
  UpdateMusicTogetherSectionResponse,
} from '@maple/ts/firebase/api-types';

export const updateMusicTogetherSection = createRoleFunction<
  UpdateMusicTogetherSectionRequest,
  UpdateMusicTogetherSectionResponse
>(async (data) => {
  const existing = await MusicTogetherSectionRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Music Together section', data.id);
  }

  // Validate the merged record (partial edit checked against the full shape).
  const merged = { ...existing, ...data };
  const result = musicTogetherSectionValidation(merged);
  if (result.hasErrors()) {
    const errors = result.getErrors();
    const messages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${messages}`);
  }

  const section = await MusicTogetherSectionRepository.update(data);
  return { section };
}, [Role.Admin, Role.MtTeacher]);
