/**
 * getLessonInquiries Cloud Function (#795)
 *
 * The read behind the `/leads` queue. Admin-only for now: an inquiry carries a
 * family's name, email and phone before they are a customer, which is not
 * something the lesson-teacher role needs to see the whole of.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { LessonInquiryRepository } from '@maple/firebase/database';
import type {
  GetLessonInquiriesRequest,
  GetLessonInquiriesResponse,
} from '@maple/ts/firebase/api-types';

export const getLessonInquiries = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<GetLessonInquiriesRequest, GetLessonInquiriesResponse>(
    async (data) => {
      const inquiries = await LessonInquiryRepository.findAll({
        status: data?.status,
      });
      return { inquiries };
    }
  );
