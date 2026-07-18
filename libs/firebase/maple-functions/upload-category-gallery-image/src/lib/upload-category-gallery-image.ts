/**
 * Upload Class Category Gallery Image Cloud Function
 *
 * Uploads an image to a class category's shared image pool (admin only).
 * Classes can later reference the same URL in their own `galleryImages`
 * without re-uploading.
 *
 * Stored at `categories/{categoryId}/gallery/photo_{timestamp}.{ext}`.
 */
import {
  createRoleFunction,
  FirebaseProject,
  throwValidationError,
  Role,
} from '@maple/firebase/functions';
import { imageUploadValidation } from '@maple/ts/validation';
import { getStorage } from 'firebase-admin/storage';
import type {
  UploadCategoryGalleryImageRequest,
  UploadCategoryGalleryImageResponse,
} from '@maple/ts/firebase/api-types';

export const uploadCategoryGalleryImage = createRoleFunction<
  UploadCategoryGalleryImageRequest,
  UploadCategoryGalleryImageResponse
>(async (data) => {
  const { categoryId, imageBase64, contentType } = data;

  const validation = imageUploadValidation({ imageBase64, contentType });
  if (validation.hasErrors()) {
    throwValidationError(validation.getErrors());
  }

  const bucket = getStorage().bucket(FirebaseProject.storageBucket);

  const timestamp = Date.now();
  const extension = contentType.split('/')[1] || 'jpg';
  const fileName = categoryId
    ? `categories/${categoryId}/gallery/photo_${timestamp}.${extension}`
    : `categories/temp/gallery/photo_${timestamp}.${extension}`;

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
}, [Role.Admin, Role.Clerk]);
