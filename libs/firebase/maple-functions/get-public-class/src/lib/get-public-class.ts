/**
 * Get Public Class Cloud Function
 *
 * Retrieves a single published class by ID for public display (no auth required).
 * Returns enriched data: instructor name, category name, spots remaining.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions } from '@maple/firebase/functions';
import {
  ClassRepository,
  InstructorRepository,
  ClassCategoryRepository,
  RegistrationRepository,
} from '@maple/firebase/database';
import { toPublicClass } from '@maple/ts/domain';
import type {
  GetPublicClassRequest,
  GetPublicClassResponse,
} from '@maple/ts/firebase/api-types';

// Keep warm in prod only — dev/emulator/CI run cold (no latency-sensitive users).
const minInstances =
  process.env['GCLOUD_PROJECT'] === 'maple-and-spruce' ? 1 : 0;

export const getPublicClass = Functions.endpoint
  .withOptions({ minInstances, concurrency: 80 })
  .handle<GetPublicClassRequest, GetPublicClassResponse>(async (data) => {
  if (!data.id) {
    throw new Error('Class ID is required');
  }

  const classEntity = await ClassRepository.findById(data.id);
  if (!classEntity) {
    throw new Error(`Class not found: ${data.id}`);
  }

  if (classEntity.status !== 'published') {
    throw new Error('This class is not available');
  }

  // Fetch enrichment data in parallel
  const [instructor, category, registrationCount] = await Promise.all([
    classEntity.instructorId
      ? InstructorRepository.findById(classEntity.instructorId)
      : Promise.resolve(undefined),
    classEntity.categoryId
      ? ClassCategoryRepository.findById(classEntity.categoryId)
      : Promise.resolve(undefined),
    RegistrationRepository.countByClassId(classEntity.id),
  ]);

  const publicClass = toPublicClass(
    classEntity,
    instructor?.name,
    category?.name,
    registrationCount
  );

  return { class: publicClass };
});
