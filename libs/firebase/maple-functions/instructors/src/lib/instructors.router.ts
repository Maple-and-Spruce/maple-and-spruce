/**
 * instructors — the instructors domain as one Cloud Function (ADR-029, #64).
 *
 * Six single-purpose functions become six routes on one deployable, for the
 * deploy-quota reason in ADR-029. Handlers are the originals, moved not
 * rewritten (`instructors.ts`, `upload-instructor-image.ts`), so a behaviour
 * change cannot hide in this diff. Runtime options are now shared: none of
 * the six set any, so nothing changes there either.
 *
 * Gates are as each function declared on its own: reads are
 * `[Admin, LessonTeacher]` (a lesson teacher sees colleagues, minus contractor
 * readiness, which the handlers strip), everything that writes is admin-only.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { instructorValidation } from '@maple/ts/validation';
import type {
  CreateInstructorRequest,
  CreateInstructorResponse,
  DeleteInstructorRequest,
  DeleteInstructorResponse,
  GetInstructorRequest,
  GetInstructorResponse,
  GetInstructorsRequest,
  GetInstructorsResponse,
  UpdateInstructorRequest,
  UpdateInstructorResponse,
  UploadInstructorImageRequest,
  UploadInstructorImageResponse,
} from '@maple/ts/firebase/api-types';
import {
  createInstructor,
  createInstructorEmailUniqueness,
  deleteInstructor,
  getInstructor,
  getInstructors,
  updateInstructor,
} from './instructors';
import { uploadInstructorImage } from './upload-instructor-image';

export const instructors = Functions.router('instructors', {
  getInstructors: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetInstructorsRequest, GetInstructorsResponse>(getInstructors),

  getInstructor: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetInstructorRequest, GetInstructorResponse>(getInstructor),

  createInstructor: Functions.endpoint
    .requiringRole(Role.Admin)
    .validating(instructorValidation)
    .ensuringUnique<CreateInstructorRequest>(createInstructorEmailUniqueness)
    .asRoute<CreateInstructorRequest, CreateInstructorResponse>(createInstructor),

  updateInstructor: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<UpdateInstructorRequest, UpdateInstructorResponse>(updateInstructor),

  deleteInstructor: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<DeleteInstructorRequest, DeleteInstructorResponse>(deleteInstructor),

  uploadInstructorImage: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<UploadInstructorImageRequest, UploadInstructorImageResponse>(
      uploadInstructorImage
    ),
});
