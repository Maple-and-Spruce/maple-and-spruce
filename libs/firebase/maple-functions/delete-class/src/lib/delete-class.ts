/**
 * Delete Class Cloud Function
 *
 * Deletes an existing class/workshop.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import type {
  DeleteClassRequest,
  DeleteClassResponse,
} from '@maple/ts/firebase/api-types';

export const deleteClass = createAdminFunction<
  DeleteClassRequest,
  DeleteClassResponse
>(async (data) => {
  // Check if class exists
  const existing = await ClassRepository.findById(data.id);
  if (!existing) {
    throw new Error(`Class not found: ${data.id}`);
  }

  // TODO: In Phase 3c, check for existing registrations before allowing deletion

  await ClassRepository.delete(data.id);

  return { success: true };
});
