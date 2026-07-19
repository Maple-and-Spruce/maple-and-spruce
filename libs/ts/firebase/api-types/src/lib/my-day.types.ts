/**
 * Teacher "My Day" API types (#631).
 *
 * A lesson teacher's own lessons for a day, each with the student and the
 * invoice tied to it — assembled server-side (the client can't resolve which
 * instructor the signed-in user is).
 */
import type {
  InvoicePaymentSource,
  InvoiceStatus,
  Lesson,
} from '@maple/ts/domain';

export interface MyDayLessonInvoice {
  id: string;
  status: InvoiceStatus;
  /** paymentRecord.source when paid. */
  source?: InvoicePaymentSource;
  totalCents: number;
}

export interface MyDayLesson {
  lesson: Lesson;
  studentId: string;
  studentName: string;
  /** The invoice referencing this lesson (via a lineItem.lessonId), if any. */
  invoice?: MyDayLessonInvoice;
}

export interface GetMyDayLessonsRequest {
  /** ISO timestamps bounding the day (client passes its local start/end of
   *  day). Defaults to the server's today when omitted. */
  from?: string;
  to?: string;
}

export interface GetMyDayLessonsResponse {
  lessons: MyDayLesson[];
  /** Business Venmo handle for the pay-by-Venmo QR, if configured. */
  venmoHandle?: string;
  /** True when the caller isn't linked to any instructor record (no lessons). */
  unlinked: boolean;
}
