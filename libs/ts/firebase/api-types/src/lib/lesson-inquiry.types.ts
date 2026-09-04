/**
 * Lesson inquiry API contracts (#795).
 */
import type {
  LessonInquiry,
  LessonInquiryStatus,
} from '@maple/ts/domain';

export interface GetLessonInquiriesRequest {
  /** Omit for every inquiry; the queue defaults to the open ones. */
  status?: LessonInquiryStatus;
}

export interface GetLessonInquiriesResponse {
  inquiries: LessonInquiry[];
}

export interface UpdateLessonInquiryStatusRequest {
  id: string;
  status: LessonInquiryStatus;
  /** Required when moving to `enrolled` — the Student this inquiry became. */
  studentId?: string;
  followUpNote?: string;
}

export interface UpdateLessonInquiryStatusResponse {
  inquiry: LessonInquiry;
}
