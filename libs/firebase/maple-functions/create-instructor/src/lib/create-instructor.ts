import {
  Functions,
  Role,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import {
  InstructorRepository,
  InstrumentsConfigRepository,
} from '@maple/firebase/database';
import { instrumentLabel, unofferedRateInstruments } from '@maple/ts/domain';
import { instructorValidation } from '@maple/ts/validation';
import type {
  CreateInstructorRequest,
  CreateInstructorResponse,
} from '@maple/ts/firebase/api-types';

export const createInstructor = Functions.endpoint
  .requiringRole(Role.Admin)
  .validating(instructorValidation)
  .ensuringUnique<CreateInstructorRequest>({
    entity: 'Instructor',
    field: 'email',
    exists: async (email) =>
      (await InstructorRepository.findByEmail(email)) !== undefined,
  })
  .handle<CreateInstructorRequest, CreateInstructorResponse>(async (data) => {
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
  });
