/**
 * Upload Artist Image Cloud Function
 *
 * Uploads an artist photo to Firebase Storage (admin only).
 *
 * Following the pattern from Mountain Sol Platform's uploadClassImage function.
 * Images are stored in Firebase Storage and made publicly accessible.
 * The returned URL can be stored in the artist's photoUrl field.
 */
import {
  createAdminFunction,
  FirebaseProject,
  throwValidationError,
} from '@maple/firebase/functions';
import { imageUploadValidation } from '@maple/ts/validation';
import admin from 'firebase-admin';
import type {
  UploadArtistImageRequest,
  UploadArtistImageResponse,
} from '@maple/ts/firebase/api-types';

export const uploadArtistImage = createAdminFunction<
  UploadArtistImageRequest,
  UploadArtistImageResponse
>(async (data) => {
  const { artistId, imageBase64, contentType } = data;

  const validation = imageUploadValidation({ imageBase64, contentType });
  if (validation.hasErrors()) {
    throwValidationError(validation.getErrors());
  }

  // Get Firebase Storage bucket for current project
  const bucket = admin.storage().bucket(FirebaseProject.storageBucket);

  // Generate unique file name
  const timestamp = Date.now();
  const extension = contentType.split('/')[1] || 'jpg';
  const fileName = artistId
    ? `artists/${artistId}/photo_${timestamp}.${extension}`
    : `artists/temp/photo_${timestamp}.${extension}`;

  // Convert base64 to buffer and upload
  const file = bucket.file(fileName);
  const buffer = Buffer.from(imageBase64, 'base64');

  await file.save(buffer, {
    metadata: {
      contentType,
    },
  });

  // Generate public URL using Firebase Storage URL format
  // Requires storage.rules to allow public read access for artists/ path
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;

  return {
    success: true,
    url: publicUrl,
  };
});
