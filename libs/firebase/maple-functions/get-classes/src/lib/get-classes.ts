/**
 * Get Classes Cloud Function
 *
 * Retrieves all classes with optional filters.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import type {
  GetClassesRequest,
  GetClassesResponse,
} from '@maple/ts/firebase/api-types';

export const getClasses = createAuthenticatedFunction<
  GetClassesRequest,
  GetClassesResponse
>(async (data) => {
  const classes = await ClassRepository.findAll({
    status: data.status,
    categoryId: data.categoryId,
    instructorId: data.instructorId,
    upcoming: data.upcoming,
  });

  return { classes };
});
