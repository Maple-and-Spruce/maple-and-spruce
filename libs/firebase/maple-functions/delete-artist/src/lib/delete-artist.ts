/**
 * Delete Artist Cloud Function
 *
 * Deletes an artist (admin only).
 * Note: Consider using updateArtist to set status to 'inactive' instead
 * to preserve historical records.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import type {
  DeleteArtistRequest,
  DeleteArtistResponse,
} from '@maple/ts/firebase/api-types';

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
