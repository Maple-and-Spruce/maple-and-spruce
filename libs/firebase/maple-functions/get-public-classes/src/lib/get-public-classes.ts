/**
 * Get Public Classes Cloud Function
 *
 * Retrieves published classes for public display (no auth required).
 * Only returns classes with status='published' and future dates.
 * Enriches with instructor names, category names, and live registration counts.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createPublicFunction } from '@maple/firebase/functions';
import {
  ClassRepository,
  InstructorRepository,
  ClassCategoryRepository,
  RegistrationRepository,
} from '@maple/firebase/database';
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

  if (classes.length === 0) {
    return { classes: [] };
  }

  // Batch fetch enrichment data in parallel
  const [instructors, categories] = await Promise.all([
    InstructorRepository.findAll(),
    ClassCategoryRepository.findAll(),
  ]);

  // Build lookup maps
  const instructorMap = new Map(instructors.map((i) => [i.id, i.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  // Fetch registration counts per class in parallel
  const registrationCounts = await Promise.all(
    classes.map((c) =>
      RegistrationRepository.countByClassId(c.id).then((count) => ({
        classId: c.id,
        count,
      }))
    )
  );
  const countMap = new Map(registrationCounts.map((r) => [r.classId, r.count]));

  // Apply skill level filter if provided
  let filteredClasses = classes;
  if (data.skillLevel) {
    filteredClasses = classes.filter((c) => c.skillLevel === data.skillLevel);
  }

  // Apply limit if provided
  if (data.limit && data.limit > 0) {
    filteredClasses = filteredClasses.slice(0, data.limit);
  }

  // Convert to public format with enrichment
  const publicClasses = filteredClasses.map((c) =>
    toPublicClass(
      c,
      c.instructorId ? instructorMap.get(c.instructorId) : undefined,
      c.categoryId ? categoryMap.get(c.categoryId) : undefined,
      countMap.get(c.id) ?? 0
    )
  );

  return { classes: publicClasses };
});
