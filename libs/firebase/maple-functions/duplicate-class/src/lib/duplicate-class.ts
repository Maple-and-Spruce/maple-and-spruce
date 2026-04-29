/**
 * Duplicate Class Cloud Function
 *
 * Creates a new class document by cloning an existing one. Used by the
 * admin "Copy" action so Katie can spin up a new class without re-entering
 * every detail.
 *
 * Behaviour:
 * - Cloned: description, instructorId, durationMinutes, capacity, priceCents,
 *   imageUrl, galleryImages, categoryId, skillLevel, location,
 *   materialsIncluded, whatToBring, minimumAge.
 * - `name` gets a " (Copy)" suffix so the duplicate is easy to find in
 *   admin lists.
 * - `status` is forced to `draft`. Katie reviews the new dates before
 *   publishing.
 * - `sessions` is cleared. Katie sets fresh dates on the duplicate;
 *   carrying over the source's dates would be misleading.
 * - `registrationClosesAt` is cleared (it referenced the source's first
 *   session).
 * - `webflowItemId` is omitted, so the next sync creates a fresh Webflow
 *   item rather than overwriting the source's.
 * - Image URLs are copied as-is — Firebase Storage references are shared,
 *   no file duplication.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import type { CreateClassInput } from '@maple/ts/domain';
import type {
  DuplicateClassRequest,
  DuplicateClassResponse,
} from '@maple/ts/firebase/api-types';

export const duplicateClass = createAdminFunction<
  DuplicateClassRequest,
  DuplicateClassResponse
>(async (data) => {
  if (!data.sourceClassId) {
    throwInvalidArgument('Source class ID is required');
  }

  const source = await ClassRepository.findById(data.sourceClassId);
  if (!source) {
    throwNotFound('Class', data.sourceClassId);
  }

  const input: CreateClassInput = {
    name: `${source.name} (Copy)`,
    description: source.description,
    shortDescription: source.shortDescription,
    instructorId: source.instructorId,
    sessions: [],
    durationMinutes: source.durationMinutes,
    capacity: source.capacity,
    priceCents: source.priceCents,
    imageUrl: source.imageUrl,
    galleryImages: source.galleryImages
      ? source.galleryImages.map((img) => ({ ...img }))
      : undefined,
    categoryId: source.categoryId,
    skillLevel: source.skillLevel,
    status: 'draft',
    location: source.location,
    materialsIncluded: source.materialsIncluded,
    whatToBring: source.whatToBring,
    minimumAge: source.minimumAge,
  };

  const created = await ClassRepository.create(input);

  return { class: created };
});
