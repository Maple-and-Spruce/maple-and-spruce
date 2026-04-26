/**
 * Upload Class Gallery Image Cloud Function
 *
 * Uploads a supplementary gallery image for a class to Firebase Storage
 * (admin only). The returned URL is appended (with admin-supplied alt
 * text) to the class's `galleryImages` array on the next `updateClass`.
 *
 * Stored at `classes/{classId}/gallery/photo_{timestamp}.{ext}` so that
 * gallery images live alongside the existing primary `imageUrl` upload
 * but in a separate subdirectory.
 */
import {
  createAdminFunction,
  FirebaseProject,
  throwValidationError,
} from '@maple/firebase/functions';
import { imageUploadValidation } from '@maple/ts/validation';
import admin from 'firebase-admin';
import type {
  UploadClassGalleryImageRequest,
  UploadClassGalleryImageResponse,
} from '@maple/ts/firebase/api-types';

export const uploadClassGalleryImage = createAdminFunction<
  UploadClassGalleryImageRequest,
  UploadClassGalleryImageResponse
>(async (data) => {
  const { classId, imageBase64, contentType } = data;

  const validation = imageUploadValidation({ imageBase64, contentType });
  if (validation.hasErrors()) {
    throwValidationError(validation.getErrors());
  }

  const bucket = admin.storage().bucket(FirebaseProject.storageBucket);

  const timestamp = Date.now();
  const extension = contentType.split('/')[1] || 'jpg';
  const fileName = classId
    ? `classes/${classId}/gallery/photo_${timestamp}.${extension}`
    : `classes/temp/gallery/photo_${timestamp}.${extension}`;

  const file = bucket.file(fileName);
  const buffer = Buffer.from(imageBase64, 'base64');

  await file.save(buffer, {
    metadata: { contentType },
  });

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;

  return {
    success: true,
    url: publicUrl,
  };
});
