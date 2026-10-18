/**
 * getLessonInquiries Cloud Function (legacy #795)
 *
 * The read behind the `/leads` queue. Admin-only for now: an inquiry carries a
 * family's name, email and phone before they are a customer, which is not
 * something the lesson-teacher role needs to see the whole of.
 */
import { LessonInquiryRepository } from '@maple/firebase/database';
import type {
  GetLessonInquiriesRequest,
  GetLessonInquiriesResponse,
} from '@maple/ts/firebase/api-types';

export async function getLessonInquiries(
  data: GetLessonInquiriesRequest,
): Promise<GetLessonInquiriesResponse> {
  const inquiries = await LessonInquiryRepository.findAll({
    status: data?.status,
  });
  return { inquiries };
}
