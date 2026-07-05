/**
 * Update Music Together Semester Cloud Function (admin)
 *
 * Updates an existing semester. Validates the merged record so partial edits
 * are checked against the full shape. Deployed to us-east4 via CI/CD
 * (maple-core).
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { MusicTogetherSemesterRepository } from '@maple/firebase/database';
import { musicTogetherSemesterValidation } from '@maple/ts/validation';
import type {
  UpdateMusicTogetherSemesterRequest,
  UpdateMusicTogetherSemesterResponse,
} from '@maple/ts/firebase/api-types';

export const updateMusicTogetherSemester = createAdminFunction<
  UpdateMusicTogetherSemesterRequest,
  UpdateMusicTogetherSemesterResponse
>(async (data) => {
  const existing = await MusicTogetherSemesterRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Music Together semester', data.id);
  }

  // Validate the merged record (partial edit checked against the full shape).
  const merged = { ...existing, ...data };
  const result = musicTogetherSemesterValidation(merged);
  if (result.hasErrors()) {
    const errors = result.getErrors();
    const messages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${messages}`);
  }

  const semester = await MusicTogetherSemesterRepository.update(data);
  return { semester };
});
