/**
 * Teacher payout aggregation (#283).
 *
 * Pure functions that derive what Katie owes each teacher in a period,
 * from existing data — no new entity. Two sources feed this:
 *   1. Paid private-pay invoices: each `lineItem` with a `lessonId`
 *      generates a payout line for whichever teacher actually taught
 *      that lesson (substitute-aware via `wasTaughtBySubstitute`).
 *   2. Rendered Hope-Scholarship lessons: Hope students are invoiced
 *      externally through EMA, so the lesson itself is the signal; we
 *      resolve the base revenue from the Hope rate table by the
 *      student's registered lesson-length tier.
 *
 * Excluded: scheduled-but-unpaid private-pay, scheduled-but-not-yet-
 * rendered Hope, cancelled lessons, voided invoices, non-Hope rendered
 * lessons that haven't made it onto a paid invoice yet.
 */
import type { Instructor } from './instructor';
import {
  calculateInstructorPayment,
} from './instructor';
import type { Invoice } from './invoice';
import type { Lesson, LessonStatus } from './lesson';
import { wasTaughtBySubstitute } from './lesson';
import type { Student, LessonLength } from './student';
import { getHopePerLessonRateCents } from './hope-rates';

export type TeacherPayoutLineSource = 'private-paid' | 'hope-rendered';

export interface TeacherPayoutLine {
  /** The Firestore lesson id this payout line traces to. */
  lessonId: string;
  /** For private-paid lines, the invoice that unlocked this payout. */
  invoiceId?: string;
  studentId: string;
  studentName: string;
  scheduledAt: Date;
  durationMinutes: number;
  source: TeacherPayoutLineSource;
  /**
   * What Katie owes the teacher for this lesson. Undefined when the
   * teacher's `payRate` / `payRateType` are not configured; the UI
   * surfaces that as "Rate not set" rather than silently dropping.
   */
  compensationCents: number | undefined;
  /** Base revenue the compensation derives from (invoice-line subtotal or Hope rate). */
  baseRevenueCents: number;
  asSubstitute: boolean;
}

export interface TeacherPayout {
  teacherId: string;
  teacherName: string;
  totalOwedCents: number;
  /**
   * True iff the teacher has no `payRate`/`payRateType` configured, so
   * every line's compensationCents is undefined. The UI shows a
   * "Configure instructor pay rate" nudge.
   */
  missingRateConfig: boolean;
  lines: TeacherPayoutLine[];
}

export interface AggregateTeacherPayoutsInput {
  /** Lessons to consider (caller decides date filter; aggregation filters by status + source). */
  lessons: Lesson[];
  /** Invoices to consider (caller pre-filters to status=paid + paidAt in range). */
  paidInvoices: Invoice[];
  students: Student[];
  instructors: Instructor[];
  /** Optional restriction to a single teacher. */
  teacherIdFilter?: string;
}

/**
 * Map a lesson duration to a default Hope tier when the student has no
 * `registeredLessonLength` set. 30-min defaults to `30-min-full` (the
 * common case — `30-min-initial` applies only to brand-new students).
 */
function defaultTierForDuration(durationMinutes: number): LessonLength {
  if (durationMinutes >= 60) return '60-min';
  if (durationMinutes >= 45) return '45-min';
  return '30-min-full';
}

/**
 * Resolve the base revenue (in cents) for a Hope rendered lesson. Uses
 * the student's registered tier when set; falls back to a tier derived
 * from the lesson's duration.
 */
export function hopeLessonBaseRevenueCents(
  lesson: Pick<Lesson, 'durationMinutes'>,
  student: Pick<Student, 'registeredLessonLength'>
): number {
  const tier =
    student.registeredLessonLength ?? defaultTierForDuration(lesson.durationMinutes);
  return getHopePerLessonRateCents(tier);
}

/**
 * Compute a single line's teacher compensation. `baseRevenueCents` is
 * the invoice-line subtotal for private-paid, or the Hope per-lesson
 * rate for Hope-rendered.
 */
export function computeLessonCompensationCents(
  instructor: Pick<Instructor, 'payRate' | 'payRateType'>,
  lesson: Pick<Lesson, 'durationMinutes'>,
  baseRevenueCents: number
): number | undefined {
  return calculateInstructorPayment(
    instructor as Instructor,
    lesson.durationMinutes,
    baseRevenueCents
  );
}

/**
 * Lessons with these statuses are excluded from payouts entirely:
 * cancelled never earns the teacher anything; scheduled isn't paid yet
 * (private) or rendered yet (Hope).
 */
export function isLessonPayoutEligible(
  status: LessonStatus,
  source: TeacherPayoutLineSource
): boolean {
  if (source === 'private-paid') {
    // Private-pay eligibility is keyed on the invoice being paid, not
    // the lesson status — we accept any lesson status except cancelled.
    return status !== 'cancelled';
  }
  // Hope rendered — the lesson itself must be rendered.
  return status === 'rendered';
}

/**
 * Aggregate teacher payouts from pre-filtered lessons + paid invoices.
 * Caller is responsible for applying the date range filter (invoice
 * `paidAt` for private-paid, lesson `scheduledAt` for Hope rendered).
 */
export function aggregateTeacherPayouts(
  input: AggregateTeacherPayoutsInput
): TeacherPayout[] {
  const { lessons, paidInvoices, students, instructors, teacherIdFilter } =
    input;

  const studentsById = new Map(students.map((s) => [s.id, s]));
  const instructorsById = new Map(instructors.map((i) => [i.id, i]));
  const lessonsById = new Map(lessons.map((l) => [l.id, l]));

  const linesByTeacher = new Map<string, TeacherPayoutLine[]>();
  const privatePaidLessonIds = new Set<string>();

  // --- 1) Private-paid: walk paid invoices, emit a line per lesson-linked line item ---
  for (const invoice of paidInvoices) {
    // Defensive: only paid invoices feed payouts; caller should filter,
    // but double-check.
    if (invoice.status !== 'paid') continue;

    for (const line of invoice.lineItems) {
      if (!line.lessonId) continue; // free-form line, not teacher-attributable
      const lesson = lessonsById.get(line.lessonId);
      if (!lesson) continue;
      if (!isLessonPayoutEligible(lesson.status, 'private-paid')) continue;

      const student = studentsById.get(lesson.studentId);
      const teacher = instructorsById.get(lesson.teacherId);
      if (!teacher) continue;
      if (teacherIdFilter && teacher.id !== teacherIdFilter) continue;

      const compensationCents = computeLessonCompensationCents(
        teacher,
        lesson,
        line.subtotalCents
      );

      const lineEntry: TeacherPayoutLine = {
        lessonId: lesson.id,
        invoiceId: invoice.id,
        studentId: lesson.studentId,
        studentName: student?.name ?? '(unknown student)',
        scheduledAt: lesson.scheduledAt,
        durationMinutes: lesson.durationMinutes,
        source: 'private-paid',
        compensationCents,
        baseRevenueCents: line.subtotalCents,
        asSubstitute: wasTaughtBySubstitute(lesson, student?.primaryTeacherId),
      };

      const existing = linesByTeacher.get(teacher.id) ?? [];
      existing.push(lineEntry);
      linesByTeacher.set(teacher.id, existing);
      privatePaidLessonIds.add(lesson.id);
    }
  }

  // --- 2) Hope rendered: emit a line per rendered Hope lesson not already counted ---
  for (const lesson of lessons) {
    if (!isLessonPayoutEligible(lesson.status, 'hope-rendered')) continue;
    if (privatePaidLessonIds.has(lesson.id)) continue; // already counted as private-paid

    const student = studentsById.get(lesson.studentId);
    if (!student || !student.isHopeScholarship) continue;

    const teacher = instructorsById.get(lesson.teacherId);
    if (!teacher) continue;
    if (teacherIdFilter && teacher.id !== teacherIdFilter) continue;

    const baseRevenueCents = hopeLessonBaseRevenueCents(lesson, student);
    const compensationCents = computeLessonCompensationCents(
      teacher,
      lesson,
      baseRevenueCents
    );

    const lineEntry: TeacherPayoutLine = {
      lessonId: lesson.id,
      studentId: lesson.studentId,
      studentName: student.name,
      scheduledAt: lesson.scheduledAt,
      durationMinutes: lesson.durationMinutes,
      source: 'hope-rendered',
      compensationCents,
      baseRevenueCents,
      asSubstitute: wasTaughtBySubstitute(lesson, student.primaryTeacherId),
    };

    const existing = linesByTeacher.get(teacher.id) ?? [];
    existing.push(lineEntry);
    linesByTeacher.set(teacher.id, existing);
  }

  // --- 3) Build the payouts list, total + missing-rate summary ---
  const payouts: TeacherPayout[] = [];
  for (const [teacherId, lines] of linesByTeacher.entries()) {
    const teacher = instructorsById.get(teacherId);
    if (!teacher) continue;

    // Sort lines newest-first for UI consumption
    const sortedLines = [...lines].sort(
      (a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime()
    );

    const totalOwedCents = sortedLines.reduce(
      (sum, line) => sum + (line.compensationCents ?? 0),
      0
    );
    const missingRateConfig = sortedLines.every(
      (l) => l.compensationCents === undefined
    );

    payouts.push({
      teacherId,
      teacherName: teacher.name,
      totalOwedCents,
      missingRateConfig,
      lines: sortedLines,
    });
  }

  // Sort payouts by total owed descending (biggest obligation first)
  return payouts.sort((a, b) => b.totalOwedCents - a.totalOwedCents);
}
