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
