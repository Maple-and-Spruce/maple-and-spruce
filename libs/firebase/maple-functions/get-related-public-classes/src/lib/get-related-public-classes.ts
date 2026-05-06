/**
 * Get Related Public Classes Cloud Function
 *
 * Public (no auth) endpoint used by the embedded Webflow registration
 * widget when a class is full. Returns other published classes in the
 * same category with future sessions and spots remaining — i.e. the
 * "you can take this class on a different date" suggestions.
 *
 * Excludes the source class itself. Sorted by earliest upcoming session.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions, throwInvalidArgument, throwNotFound } from '@maple/firebase/functions';
import {
  ClassRepository,
  InstructorRepository,
  ClassCategoryRepository,
  RegistrationRepository,
} from '@maple/firebase/database';
import { toPublicClass } from '@maple/ts/domain';
import type {
  GetRelatedPublicClassesRequest,
  GetRelatedPublicClassesResponse,
} from '@maple/ts/firebase/api-types';

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 6;

export const getRelatedPublicClasses = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .handle<GetRelatedPublicClassesRequest, GetRelatedPublicClassesResponse>(
    async (data) => {
      if (!data.classId) throwInvalidArgument('Class ID is required');

      const sourceClass = await ClassRepository.findById(data.classId);
      if (!sourceClass) throwNotFound('Class', data.classId);

      // No category → no related classes. Return empty rather than erroring;
      // the widget will simply hide the section.
      if (!sourceClass!.categoryId) return { classes: [] };

      const limit = Math.min(
        Math.max(1, data.limit ?? DEFAULT_LIMIT),
        MAX_LIMIT
      );

      // Filter at the repo for status + category, then trim in-memory by
      // upcoming-and-available. The repo's `upcoming: true` filter does
      // the future-session check; capacity check requires a count query
      // per class, so we cap candidates first.
      const candidates = await ClassRepository.findAll({
        status: 'published',
        categoryId: sourceClass!.categoryId,
        upcoming: true,
      });

      const others = candidates.filter((c) => c.id !== data.classId);
      // Cap before counting so we don't issue N count queries on a popular
      // category with many upcoming classes.
      const trimmed = others.slice(0, limit * 2);

      const enriched = await Promise.all(
        trimmed.map(async (c) => {
          const [instructor, category, registrationCount] = await Promise.all([
            c.instructorId
              ? InstructorRepository.findById(c.instructorId)
              : Promise.resolve(undefined),
            c.categoryId
              ? ClassCategoryRepository.findById(c.categoryId)
              : Promise.resolve(undefined),
            RegistrationRepository.countByClassId(c.id),
          ]);
          return toPublicClass(
            c,
            instructor?.name,
            category?.name,
            registrationCount
          );
        })
      );

      // Drop classes that have no spots remaining; sort by earliest upcoming
      // session for a stable "soonest first" experience.
      const available = enriched
        .filter((c) => c.spotsRemaining > 0)
        .sort((a, b) => {
          const aTime = new Date(a.sessions[0]?.dateTime ?? 0).getTime();
          const bTime = new Date(b.sessions[0]?.dateTime ?? 0).getTime();
          return aTime - bTime;
        })
        .slice(0, limit);

      return { classes: available };
    }
  );
