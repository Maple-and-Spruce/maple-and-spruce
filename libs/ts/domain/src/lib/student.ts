/**
 * Student domain types
 *
 * Represents music lesson students at Maple & Spruce.
 *
 * Students are admin-ingested by Katie (unlike craft classes, lessons are not
 * pay-to-reserve). Each student has a 1:1 primary teacher; individual lessons
 * may record a substitute teacher for payout attribution (see issue #279).
 *
 * Hope Scholarship (WV) students are invoiced externally via the EMA portal
 * under per-lesson-after-rendered billing rules; see issue #282.
 */

/**
 * Instruments offered for music lessons. Suzuki-method leaning with room for
 * common studio instruments. Add to this list as the studio expands.
 */
export type Instrument =
  | 'piano'
  | 'guitar'
  | 'violin'
  | 'viola'
  | 'cello'
  | 'bass'
  | 'voice'
  | 'ukulele'
  | 'mandolin'
  | 'banjo'
  | 'fiddle'
  | 'harp'
  | 'flute'
  | 'other';

export const INSTRUMENTS: Instrument[] = [
  'piano',
  'guitar',
  'violin',
  'viola',
  'cello',
  'bass',
  'voice',
  'ukulele',
  'mandolin',
  'banjo',
  'fiddle',
  'harp',
  'flute',
  'other',
];

/**
 * Lesson length. Values align with Katie's pricing tiers; "initial" is the
 * entry tier before students join group class + recitals.
 */
export type LessonLength =
  | '30-min-initial'
  | '30-min-full'
  | '45-min'
  | '60-min';

export const LESSON_LENGTHS: LessonLength[] = [
  '30-min-initial',
  '30-min-full',
  '45-min',
  '60-min',
];

/**
 * Active/inactive status. Mirrors PayeeStatus convention; inactive students
 * are retained for historical records rather than deleted.
 */
export type StudentStatus = 'active' | 'inactive';

/**
 * Student entity.
 *
 * Primary contact is the parent/guardian for minor students, or the student
 * themselves for adult students (use isAdultStudent to drive UI labeling).
 */
export interface Student {
  id: string;
  name: string;
  instrument: Instrument;
  /** Adult student flag — drives UI labeling for the primary contact fields */
  isAdultStudent: boolean;
  /** FK to instructors collection */
  primaryTeacherId: string;
  /**
   * Lesson length the student is currently registered for. Editable by Katie
   * for tracking; NOT enforced on individual lessons or invoices — those are
   * chosen per lesson / per invoice.
   */
  registeredLessonLength?: LessonLength;
  /** WV Hope Scholarship flag. Hope students are invoiced externally (#282). */
  isHopeScholarship: boolean;
  /** Parent/guardian for minors; student themselves for adults */
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
  secondaryContactEmail?: string;
  secondaryContactPhone?: string;
  /**
   * The payer's Venmo username (stored without the leading @), when they pay
   * lesson invoices via Venmo. Lets the reconciliation tool (#630) match
   * Venmo statement rows back to this student. Optional — most students pay
   * by Square. See epic #626.
   */
  venmoUsername?: string;
  /**
   * Auto-create + send a private-pay invoice when one of this student's
   * lessons is marked `rendered` (#629). Hope Scholarship students are never
   * auto-invoiced — they bill externally via EMA. Defaults to off.
   */
  autoInvoice?: boolean;
  /**
   * The billing rule this student is on (#798). Unset means the studio default.
   *
   * An override lives on the rule attachment, not by cloning the rule, so
   * changing studio policy still reaches everyone who has not deviated —
   * the same shape `lessonRateCents` uses against the rate table.
   */
  billingRuleId?: string;
  /**
   * Square customer holding this family's card on file, and the card to charge.
   *
   * Katie and Nathan were already vaulting cards in Square and charging by
   * hand; these are where that lands so the charge job can do it instead.
   * Absent means no card — the family is invoiced the existing way, and nothing
   * is ever charged silently.
   */
  squareCustomerId?: string;
  squareCardId?: string;
  /**
   * Enough of the card to name it back to a person — "Visa ••4242". Stored
   * rather than fetched, so the student page can say which card is on file
   * without a Square round trip on every render.
   */
  cardBrand?: string;
  cardLast4?: string;
  /** When the card was linked, so an old link is visibly old. */
  cardLinkedAt?: Date;
  /**
   * Per-student private-pay lesson rate override, in cents. When set it wins
   * over the standard rate-by-length table (#629). Leave unset to use the
   * default for their registered lesson length.
   */
  lessonRateCents?: number;
  notes?: string;
  status: StudentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateStudentInput = Omit<
  Student,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdateStudentInput = Partial<
  Omit<Student, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

export function isStudentActive(student: Student): boolean {
  return student.status === 'active';
}
