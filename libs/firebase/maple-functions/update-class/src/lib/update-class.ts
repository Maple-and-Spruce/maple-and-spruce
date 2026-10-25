/**
 * Update Class Cloud Function
 *
 * Updates an existing class/workshop.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { ClassRepository, RegistrationRepository } from '@maple/firebase/database';
import { formatPrivateHour, isPrivateHoursClass } from '@maple/ts/domain';
import { classValidation } from '@maple/ts/validation';
import type {
  UpdateClassRequest,
  UpdateClassResponse,
} from '@maple/ts/firebase/api-types';

export const updateClass = createAdminFunction<
  UpdateClassRequest,
  UpdateClassResponse
>(async (data) => {
  // Check if class exists
  const existing = await ClassRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Class', data.id);
  }

  // Validate update data (merge with existing for full validation)
  const merged = { ...existing, ...data };
  const result = classValidation(merged);
  if (!result.isValid()) {
    const errors = result.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // A private hour someone holds or has booked can't be taken away by an
  // edit: their registration points at that hour. The form locks dates once
  // anyone registers, but the server is the one that has to be right.
  if (isPrivateHoursClass(existing) && data.sessions) {
    const held = await RegistrationRepository.findHeldSlotStarts(existing.id);
    const kept = new Set(
      data.sessions.map((s) => new Date(s.dateTime).getTime())
    );
    const removed = held.filter((d) => !kept.has(d.getTime()));
    if (removed.length > 0) {
      throwInvalidArgument(
        `These hours are booked and can't be removed: ${removed
          .map((d) => formatPrivateHour(d, existing.durationMinutes))
          .join('; ')}`
      );
    }
  }

  const classItem = await ClassRepository.update(data);

  return { class: classItem };
});
