/**
 * Lesson inquiry domain types (#795)
 *
 * A family asking about music lessons, captured from a Tally form and given a
 * status so it stops being an unread email.
 *
 * Before this existed, an inquiry lived in Tally and in Katie's inbox and
 * nowhere else: `tallyLeadWebhook` fires analytics beacons and writes nothing.
 * There was no way to answer "who inquired three weeks ago and never heard back
 * from us", which is the one question a paid funnel has to be able to answer.
 *
 * `id` is the **Tally submission id**. That is what makes ingestion idempotent
 * without a dedupe query: re-reading the same submission writes the same
 * document id, so a repeated poll is a no-op rather than a duplicate lead.
 */

/**
 * Where the inquiry is in the follow-up.
 *
 * Deliberately permissive: any status can move to any other (see
 * `isValidStatusChange`). This is a queue worked by two people between lessons,
 * and a state machine that refuses to let Katie undo a misclick would get
 * worked around rather than obeyed. The one real rule is that `enrolled` has to
 * point at the Student the inquiry became.
 */
export type LessonInquiryStatus =
  | 'new'
  | 'contacted'
  | 'interview-booked'
  | 'enrolled'
  | 'lost';

export const LESSON_INQUIRY_STATUSES: LessonInquiryStatus[] = [
  'new',
  'contacted',
  'interview-booked',
  'enrolled',
  'lost',
];

/** Statuses that still want someone to do something. Drives the queue's default view. */
export const OPEN_LESSON_INQUIRY_STATUSES: LessonInquiryStatus[] = [
  'new',
  'contacted',
  'interview-booked',
];

/** Answer to "are you using the WV Hope Scholarship?" — `unsure` is a real, common answer. */
export type HopeScholarshipInterest = 'yes' | 'no' | 'unsure';

/**
 * Campaign context carried on the inquiry, pulled from the Tally form's hidden
 * fields. Same field names `tallyLeadWebhook` reads, so a lead's analytics
 * attribution and its portal record agree about where it came from.
 */
export interface LessonInquiryAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingPage?: string;
}

export interface LessonInquiry {
  /** Tally submission id. Stable, and the reason ingestion is idempotent. */
  id: string;
  /** Tally form this came from — the Suzuki funnel and the general music form are both captured. */
  formId: string;
  /** Human label for the form, so the queue can be read without knowing form ids. */
  formName: string;
  /** When the family submitted, per Tally. Not when we ingested it. */
  submittedAt: Date;

  contactName: string;
  email: string;
  phone?: string;

  /** Absent on the general music form, which does not ask. */
  studentFirstName?: string;
  studentAge?: number;
  /** Free text as the family chose it, e.g. "Suzuki violin, with Katie". */
  interest?: string;
  /**
   * Who the lessons are for, when the form asks ("Who is the student?").
   *
   * Captured because it is the one answer that decides whether the person who
   * filled the form becomes the *student* or the *parent contact* on the
   * student record. Without it, creating a student from an inquiry has to
   * guess, and gets it wrong for every adult learner or every child.
   */
  studentIs?: 'self' | 'child';
  /** Availability buckets the family ticked. Empty when the form does not ask. */
  availability: string[];
  hopeScholarship?: HopeScholarshipInterest;
  /** Anything else the family wrote. */
  message?: string;

  status: LessonInquiryStatus;
  /** Set when the inquiry becomes a Student. Required for `enrolled`. */
  studentId?: string;
  /** Internal note from Katie or Nathan. Not visible to the family. */
  followUpNote?: string;

  attribution: LessonInquiryAttribution;
  createdAt: Date;
  updatedAt: Date;
}

/** Ingestion payload. `id` is supplied (the Tally submission id), never generated. */
export type CreateLessonInquiryInput = Omit<
  LessonInquiry,
  'createdAt' | 'updatedAt' | 'status' | 'studentId' | 'followUpNote'
> & {
  status?: LessonInquiryStatus;
};

export interface UpdateLessonInquiryStatusInput {
  id: string;
  status: LessonInquiryStatus;
  studentId?: string;
  followUpNote?: string;
}

/**
 * Is this status change allowed?
 *
 * Everything is, except landing on `enrolled` without saying which Student the
 * inquiry became — an enrolled lead that points at nothing is exactly the
 * broken link this entity exists to prevent.
 */
export function isValidStatusChange(
  status: LessonInquiryStatus,
  studentId: string | undefined
): boolean {
  if (status === 'enrolled') {
    return typeof studentId === 'string' && studentId.trim().length > 0;
  }
  return LESSON_INQUIRY_STATUSES.includes(status);
}

/** Is anyone still expected to act on this? */
export function isLessonInquiryOpen(
  inquiry: Pick<LessonInquiry, 'status'>
): boolean {
  return OPEN_LESSON_INQUIRY_STATUSES.includes(inquiry.status);
}

/**
 * How long an inquiry has been waiting, in whole days.
 *
 * The queue sorts and flags on this. A lead nobody has answered is the failure
 * mode worth surfacing, and it is invisible without a number attached to it.
 */
export function daysWaiting(
  inquiry: Pick<LessonInquiry, 'submittedAt'>,
  now: Date = new Date()
): number {
  const ms = now.getTime() - inquiry.submittedAt.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * An open inquiry that has been waiting too long. Two business days is the
 * promise the old form made in its own copy ("we'll be in touch within 2
 * business days"), so three calendar days is comfortably past it.
 */
export const LESSON_INQUIRY_STALE_DAYS = 3;

export function isLessonInquiryStale(
  inquiry: Pick<LessonInquiry, 'status' | 'submittedAt'>,
  now: Date = new Date()
): boolean {
  return (
    isLessonInquiryOpen(inquiry) &&
    daysWaiting(inquiry, now) >= LESSON_INQUIRY_STALE_DAYS
  );
}
