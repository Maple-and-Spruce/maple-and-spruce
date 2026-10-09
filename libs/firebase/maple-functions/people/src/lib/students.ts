/**
 * Music lesson students, served by the `people` router.
 *
 * Gated `[Admin, LessonTeacher]` on the router. A student record is child PII,
 * so a lesson teacher is narrowed further here to their OWN students: the list
 * is scoped to them, and reading or changing anyone else's is refused.
 */
import {
  assertCanManageStudent,
  assertOwnsAsInstructor,
  instructorScopeForUser,
  throwInvalidArgument,
  throwNotFound,
  type FunctionContext,
} from '@maple/firebase/functions';
import {
  InstrumentsConfigRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { instrumentLabel, isAllowedInstrument } from '@maple/ts/domain';
import { studentValidation } from '@maple/ts/validation';
import type {
  CreateStudentRequest,
  CreateStudentResponse,
  DeleteStudentRequest,
  DeleteStudentResponse,
  GetStudentRequest,
  GetStudentResponse,
  GetStudentsRequest,
  GetStudentsResponse,
  UpdateStudentRequest,
  UpdateStudentResponse,
} from '@maple/ts/firebase/api-types';

function throwIfInvalid(result: ReturnType<typeof studentValidation>): void {
  if (result.isValid()) return;
  const errorMessages = Object.entries(result.getErrors())
    .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
    .join('; ');
  throw new Error(`Validation failed: ${errorMessages}`);
}

/** Optionally filtered by status, primary teacher, or Hope Scholarship flag. */
export async function getStudents(
  data: GetStudentsRequest,
  context: FunctionContext,
): Promise<GetStudentsResponse> {
  // Lesson teachers see only their own students (read-own). Admins see all.
  const scope = await instructorScopeForUser(context);
  let primaryTeacherId = data.primaryTeacherId;
  if (!scope.isAdmin) {
    // An unlinked lesson-teacher owns no students → return an empty list.
    if (!scope.instructorId) return { students: [] };
    primaryTeacherId = scope.instructorId;
  }

  const students = await StudentRepository.findAll({
    status: data.status,
    primaryTeacherId,
    isHopeScholarship: data.isHopeScholarship,
  });

  return { students };
}

export async function getStudent(
  data: GetStudentRequest,
  context: FunctionContext,
): Promise<GetStudentResponse> {
  const student = await StudentRepository.findById(data.id);
  if (!student) throwNotFound('Student', data.id);

  await assertOwnsAsInstructor(
    context,
    student.primaryTeacherId,
    'You can only view your own students.',
  );

  return { student };
}

export async function createStudent(
  data: CreateStudentRequest,
  context: FunctionContext,
): Promise<CreateStudentResponse> {
  // A lesson teacher may only create students assigned to themselves.
  await assertCanManageStudent(context, data.primaryTeacherId);

  throwIfInvalid(studentValidation(data));

  // Only an instrument the studio offers (#161).
  const { instruments } = await InstrumentsConfigRepository.get();
  if (!isAllowedInstrument(data.instrument, instruments)) {
    throwInvalidArgument(
      `${instrumentLabel(data.instrument, instruments)} is not an instrument the studio offers.`,
    );
  }

  const student = await StudentRepository.create(data);
  return { student };
}

export async function updateStudent(
  data: UpdateStudentRequest,
  context: FunctionContext,
): Promise<UpdateStudentResponse> {
  const existing = await StudentRepository.findById(data.id);
  if (!existing) throwNotFound('Student', data.id);

  // A lesson teacher may only touch a student they teach.
  await assertCanManageStudent(context, existing.primaryTeacherId);

  // Merge with existing so partial updates still pass full validation
  throwIfInvalid(studentValidation({ ...existing, ...data }));

  // A new instrument must be one the studio offers (#161); keeping the one
  // the student already has is always fine, offered or retired.
  if (
    data.instrument !== undefined &&
    data.instrument !== existing.instrument
  ) {
    const { instruments } = await InstrumentsConfigRepository.get();
    if (
      !isAllowedInstrument(data.instrument, instruments, existing.instrument)
    ) {
      throwInvalidArgument(
        `${instrumentLabel(data.instrument, instruments)} is not an instrument the studio offers.`,
      );
    }
  }

  const student = await StudentRepository.update(data);
  return { student };
}

/**
 * Hard delete. Setting status to 'inactive' through updateStudent keeps the
 * lesson and invoice history tied to the student, and is usually the better
 * choice.
 */
export async function deleteStudent(
  data: DeleteStudentRequest,
  context: FunctionContext,
): Promise<DeleteStudentResponse> {
  const existing = await StudentRepository.findById(data.id);
  if (!existing) throwNotFound('Student', data.id);

  await assertCanManageStudent(context, existing.primaryTeacherId);

  await StudentRepository.delete(data.id);
  return { success: true };
}
