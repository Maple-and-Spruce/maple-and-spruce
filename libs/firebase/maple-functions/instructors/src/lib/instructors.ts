/**
 * Instructor CRUD, served by the `instructors` router.
 *
 * Moved from the five single-purpose functions (`getInstructors`,
 * `getInstructor`, `createInstructor`, `updateInstructor`, `deleteInstructor`)
 * without changing what they do. The role gate, and for create the Vest suite
 * and the email uniqueness check, are on the route in `instructors.router.ts`;
 * everything after that is here.
 */
import {
  hasRole,
  Role,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
  type FunctionContext,
  type UniquenessCheck,
} from '@maple/firebase/functions';
import {
  InstructorRepository,
  InstrumentsConfigRepository,
} from '@maple/firebase/database';
import {
  instrumentLabel,
  unofferedRateInstruments,
  withoutContractorReadiness,
} from '@maple/ts/domain';
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
} from '@maple/ts/firebase/api-types';

/** Whether the caller is an admin; contractor readiness is shown only to admins. */
function callerIsAdmin(context: FunctionContext): Promise<boolean> {
  return context.uid ? hasRole(context.uid, Role.Admin) : Promise.resolve(false);
}

export async function getInstructors(
  data: GetInstructorsRequest,
  context: FunctionContext
): Promise<GetInstructorsResponse> {
  const [instructors, isAdmin] = await Promise.all([
    InstructorRepository.findAll({ status: data.status }),
    callerIsAdmin(context),
  ]);

  // Contractor onboarding (background check, tax setup) is admin-only; a
  // lesson teacher listing colleagues does not see it.
  return {
    instructors: isAdmin
      ? instructors
      : instructors.map(withoutContractorReadiness),
  };
}

export async function getInstructor(
  data: GetInstructorRequest,
  context: FunctionContext
): Promise<GetInstructorResponse> {
  const [instructor, isAdmin] = await Promise.all([
    InstructorRepository.findById(data.id),
    callerIsAdmin(context),
  ]);

  if (!instructor) {
    throwNotFound('Instructor', data.id);
  }

  // Contractor onboarding is admin-only (see getInstructors).
  return {
    instructor: isAdmin ? instructor : withoutContractorReadiness(instructor),
  };
}

/**
 * The uniqueness check the create route applies before this handler runs.
 * Email is optional; two instructors without one are not duplicates.
 */
export const createInstructorEmailUniqueness: UniquenessCheck<CreateInstructorRequest> =
  {
    entity: 'Instructor',
    field: 'email',
    when: (data) => !!data.email,
    exists: async (email) =>
      !!email && (await InstructorRepository.findByEmail(email)) !== undefined,
  };

/** Runs after the route's role gate, Vest suite and email uniqueness check. */
export async function createInstructor(
  data: CreateInstructorRequest
): Promise<CreateInstructorResponse> {
  // Rates only for instruments the studio offers (#161).
  if (data.lessonRates) {
    const { instruments } = await InstrumentsConfigRepository.get();
    const unoffered = unofferedRateInstruments(data.lessonRates, instruments);
    if (unoffered.length > 0) {
      throwInvalidArgument(
        `The studio does not offer ${unoffered
          .map((key) => instrumentLabel(key, instruments))
          .join(', ')}.`
      );
    }
  }
  const instructor = await InstructorRepository.create(data);
  return { instructor };
}

export async function updateInstructor(
  data: UpdateInstructorRequest
): Promise<UpdateInstructorResponse> {
  // Check instructor exists
  const existing = await InstructorRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Instructor', data.id);
  }

  // Validate update data (merge with existing for full validation). uid is a
  // portal-login link, not a validated field, and may be null (unlink) — keep
  // it out of the validation merge so its type doesn't leak in.
  const { uid: _uid, ...dataForValidation } = data;
  const merged = { ...existing, ...dataForValidation };
  // `readiness` replaces the stored record wholesale, so validating the merge
  // validates exactly what will be written.
  const validationResult = instructorValidation(merged);
  if (validationResult.hasErrors()) {
    throwValidationError(validationResult.getErrors());
  }

  // Rates only for instruments the studio offers (#161), though rates the
  // instructor already had for a retired one may stay.
  if (data.lessonRates) {
    const { instruments } = await InstrumentsConfigRepository.get();
    const unoffered = unofferedRateInstruments(
      data.lessonRates,
      instruments,
      existing.lessonRates
    );
    if (unoffered.length > 0) {
      throwInvalidArgument(
        `The studio does not offer ${unoffered
          .map((key) => instrumentLabel(key, instruments))
          .join(', ')}.`
      );
    }
  }

  // Check for duplicate email if email is being changed
  if (data.email && data.email !== existing.email) {
    const existingWithEmail = await InstructorRepository.findByEmail(data.email);
    if (existingWithEmail) {
      throw new Error(`An instructor with email ${data.email} already exists`);
    }
  }

  // A portal login (uid) links one user to one instructor — required for the
  // lesson-teacher "manage only your own lessons" check (#49 phase 2). Guard
  // uniqueness: a uid already linked to a different instructor must be
  // unlinked there first, or ownership would be ambiguous. `null` unlinks.
  if (data.uid) {
    const linkedElsewhere = await InstructorRepository.findByUid(data.uid);
    if (linkedElsewhere && linkedElsewhere.id !== data.id) {
      throwFailedPrecondition(
        `That portal user is already linked to instructor "${linkedElsewhere.name}". Unlink them there first.`
      );
    }
  }

  const instructor = await InstructorRepository.update(data);

  return { instructor };
}

/**
 * Deletes an instructor. Prefer setting status to 'inactive' to preserve
 * historical records.
 */
export async function deleteInstructor(
  data: DeleteInstructorRequest
): Promise<DeleteInstructorResponse> {
  const existing = await InstructorRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Instructor', data.id);
  }

  await InstructorRepository.delete(data.id);

  return { success: true };
}
