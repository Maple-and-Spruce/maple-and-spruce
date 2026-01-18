/**
 * Create Artist Cloud Function
 *
 * Creates a new artist (admin only).
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import { artistValidation } from '@maple/ts/validation';
import type {
  CreateArtistRequest,
  CreateArtistResponse,
} from '@maple/ts/firebase/api-types';

export const createArtist = createAdminFunction<
  CreateArtistRequest,
  CreateArtistResponse
>(async (data) => {
  // Validate input
  const validationResult = artistValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Check for duplicate email
  const existingArtist = await ArtistRepository.findByEmail(data.email);
  if (existingArtist) {
    throw new Error(`An artist with email ${data.email} already exists`);
  }

  const artist = await ArtistRepository.create(data);

  return { artist };
});
