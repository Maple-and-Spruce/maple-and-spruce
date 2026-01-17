/**
 * Artist Cloud Functions
 *
 * CRUD operations for artist management.
 */
import {
  createAdminFunction,
  createAuthenticatedFunction,
} from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import { throwNotFound } from '@maple/firebase/functions';
import { artistValidation } from '@maple/ts/validation';
import type {
  GetArtistsRequest,
  GetArtistsResponse,
  GetArtistRequest,
  GetArtistResponse,
  CreateArtistRequest,
  CreateArtistResponse,
  UpdateArtistRequest,
  UpdateArtistResponse,
  DeleteArtistRequest,
  DeleteArtistResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Get all artists, optionally filtered by status
 */
export const getArtists = createAuthenticatedFunction<
  GetArtistsRequest,
  GetArtistsResponse
>(async (data) => {
  const artists = await ArtistRepository.findAll({
    status: data.status,
  });

  return { artists };
});

/**
 * Get a single artist by ID
 */
export const getArtist = createAuthenticatedFunction<
  GetArtistRequest,
  GetArtistResponse
>(async (data) => {
  const artist = await ArtistRepository.findById(data.id);

  if (!artist) {
    throwNotFound('Artist', data.id);
  }

  return { artist };
});

/**
 * Create a new artist (admin only)
 */
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

/**
 * Update an existing artist (admin only)
 */
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

/**
 * Delete an artist (admin only)
 * Note: Consider using updateArtist to set status to 'inactive' instead
 * to preserve historical records.
 */
export const deleteArtist = createAdminFunction<
  DeleteArtistRequest,
  DeleteArtistResponse
>(async (data) => {
  // Check artist exists
  const existing = await ArtistRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Artist', data.id);
  }

  await ArtistRepository.delete(data.id);

  return { success: true };
});
