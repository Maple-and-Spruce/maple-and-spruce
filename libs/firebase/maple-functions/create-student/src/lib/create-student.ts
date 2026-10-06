/**
 * Create Student Cloud Function
 *
 * Creates a new music lesson student (admin only).
 */
import {
  createRoleFunction,
  Role,
  assertCanManageStudent,
  throwInvalidArgument,
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
} from '@maple/ts/firebase/api-types';

export const createStudent = createRoleFunction<
  CreateStudentRequest,
  CreateStudentResponse
>(async (data, context) => {
  // A lesson teacher may only create students assigned to themselves.
  await assertCanManageStudent(context, data.primaryTeacherId);

  const validationResult = studentValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Only an instrument the studio offers (#161).
  const { instruments } = await InstrumentsConfigRepository.get();
  if (!isAllowedInstrument(data.instrument, instruments)) {
    throwInvalidArgument(
      `${instrumentLabel(data.instrument, instruments)} is not an instrument the studio offers.`
    );
  }

  const student = await StudentRepository.create(data);

  return { student };
}, [Role.Admin, Role.LessonTeacher]);
