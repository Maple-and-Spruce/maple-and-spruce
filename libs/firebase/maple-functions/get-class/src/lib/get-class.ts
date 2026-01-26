/**
 * Get Class Cloud Function
 *
 * Retrieves a single class by ID.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import type {
  GetClassRequest,
  GetClassResponse,
} from '@maple/ts/firebase/api-types';

export const getClass = createAuthenticatedFunction<
  GetClassRequest,
  GetClassResponse
>(async (data) => {
  const classItem = await ClassRepository.findById(data.id);

  if (!classItem) {
    throw new Error(`Class not found: ${data.id}`);
  }

  return { class: classItem };
});
