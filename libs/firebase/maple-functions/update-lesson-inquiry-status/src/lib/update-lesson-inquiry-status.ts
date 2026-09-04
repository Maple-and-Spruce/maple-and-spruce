/**
 * updateLessonInquiryStatus Cloud Function (#795)
 *
 * Advances a lead through the follow-up. The status model is deliberately
 * permissive (see `isValidStatusChange`) because this is a queue two people
 * work between lessons and undoing a misclick has to be trivial — the one rule
 * enforced here is that `enrolled` names the Student the inquiry became.
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { LessonInquiryRepository } from '@maple/firebase/database';
import { isValidStatusChange } from '@maple/ts/domain';
import type {
  UpdateLessonInquiryStatusRequest,
  UpdateLessonInquiryStatusResponse,
} from '@maple/ts/firebase/api-types';

export const updateLessonInquiryStatus = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<UpdateLessonInquiryStatusRequest, UpdateLessonInquiryStatusResponse>(
    async (data) => {
      if (!data.id) throwInvalidArgument('Inquiry ID is required');

      const existing = await LessonInquiryRepository.findById(data.id);
      if (!existing) throwNotFound('Lesson inquiry', data.id);

      if (!isValidStatusChange(data.status, data.studentId)) {
        throwInvalidArgument(
          data.status === 'enrolled'
            ? 'Marking an inquiry enrolled requires the student it became'
            : `Unknown lesson inquiry status: ${data.status}`
        );
      }

      const inquiry = await LessonInquiryRepository.updateStatus({
        id: data.id,
        status: data.status,
        studentId: data.studentId,
        followUpNote: data.followUpNote,
      });
      if (!inquiry) throwNotFound('Lesson inquiry', data.id);

      return { inquiry };
    }
  );
