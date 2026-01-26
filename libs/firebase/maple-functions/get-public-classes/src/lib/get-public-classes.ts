/**
 * Get Public Classes Cloud Function
 *
 * Retrieves published classes for public display (no auth required).
 * Only returns classes with status='published' and future dates.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createPublicFunction } from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import { toPublicClass } from '@maple/ts/domain';
import type {
  GetPublicClassesRequest,
  GetPublicClassesResponse,
} from '@maple/ts/firebase/api-types';

export const getPublicClasses = createPublicFunction<
  GetPublicClassesRequest,
  GetPublicClassesResponse
>(async (data) => {
  // Only fetch published classes that are upcoming
  const classes = await ClassRepository.findAll({
    status: 'published',
    categoryId: data.categoryId,
    upcoming: true,
  });

  // Convert to public format (excludes internal fields)
  // Note: enrichment data (instructor name, category name, registration count)
  // will be added in Phase 3c when we have more complete data
  const publicClasses = classes.map((c) => toPublicClass(c));

  return { classes: publicClasses };
});
