/**
 * Update Student Cloud Function
 *
 * Admin + lesson-teacher (own students only; scoped-roles epic #49).
 */
import {
  createRoleFunction,
  Role,
  throwNotFound,
  throwInvalidArgument,
  assertCanManageStudent,
} from '@maple/firebase/functions';
import {
  InstrumentsConfigRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { instrumentLabel, isAllowedInstrument } from '@maple/ts/domain';
import { studentValidation } from '@maple/ts/validation';
import type {
  UpdateStudentRequest,
  UpdateStudentResponse,
} from '@maple/ts/firebase/api-types';

export const updateStudent = createRoleFunction<
  UpdateStudentRequest,
  UpdateStudentResponse
>(async (data, context) => {
  const existing = await StudentRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Student', data.id);
  }

  // A lesson teacher may only touch a student they teach.
  await assertCanManageStudent(context, existing.primaryTeacherId);

  // Merge with existing so partial updates still pass full validation
  const merged = { ...existing, ...data };
  const validationResult = studentValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // A new instrument must be one the studio offers (#161); keeping the one
  // the student already has is always fine, offered or retired.
  if (data.instrument !== undefined && data.instrument !== existing.instrument) {
    const { instruments } = await InstrumentsConfigRepository.get();
    if (!isAllowedInstrument(data.instrument, instruments, existing.instrument)) {
      throwInvalidArgument(
        `${instrumentLabel(data.instrument, instruments)} is not an instrument the studio offers.`
      );
    }
  }

  const student = await StudentRepository.update(data);

  return { student };
}, [Role.Admin, Role.LessonTeacher]);
