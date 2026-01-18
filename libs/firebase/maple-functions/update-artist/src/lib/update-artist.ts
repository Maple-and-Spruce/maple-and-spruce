/**
 * Update Artist Cloud Function
 *
 * Updates an existing artist (admin only).
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import { artistValidation } from '@maple/ts/validation';
import type {
  UpdateArtistRequest,
  UpdateArtistResponse,
} from '@maple/ts/firebase/api-types';

export const updateArtist = createAdminFunction<
  UpdateArtistRequest,
  UpdateArtistResponse
>(async (data) => {
  // Check artist exists
  const existing = await ArtistRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Artist', data.id);
  }

  // Validate update data (merge with existing for full validation)
  const merged = { ...existing, ...data };
  const validationResult = artistValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Check for duplicate email if email is being changed
  if (data.email && data.email !== existing.email) {
    const existingWithEmail = await ArtistRepository.findByEmail(data.email);
    if (existingWithEmail) {
      throw new Error(`An artist with email ${data.email} already exists`);
    }
  }

  const artist = await ArtistRepository.update(data);

  return { artist };
});
