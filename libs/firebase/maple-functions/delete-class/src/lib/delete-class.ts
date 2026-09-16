/**
 * Delete Class Cloud Function
 *
 * Deletes an existing class/workshop.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  ClassRepository,
  RegistrationRepository,
} from '@maple/firebase/database';
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
    throwNotFound('Class', data.id);
  }

  // A class is hard-deleted with no cascade, and there is no archive
  // collection. Any registration pointing at it therefore survives it, holding
  // a classId that resolves to nothing — invisible to the roster, uncounted by
  // the spot rollup, and unreachable from the refund path.
  //
  // EVERY status counts, not just the pending/confirmed ones that hold a seat:
  // a cancelled or refunded registration is still a financial record, and
  // orphaning it loses the same thread. Cancelling the class is the operation
  // for "this isn't happening" — it keeps the record and the roster intact.
  const registrations = await RegistrationRepository.findByClassId(data.id);
  if (registrations.length > 0) {
    throwInvalidArgument(
      `Cannot delete a class with ${registrations.length} registration(s). ` +
        `Deleting it would orphan them. Cancel the class instead, which keeps ` +
        `the roster and the refund path intact.`
    );
  }

  await ClassRepository.delete(data.id);

  return { success: true };
});
