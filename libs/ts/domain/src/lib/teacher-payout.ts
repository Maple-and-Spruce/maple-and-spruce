/**
 * Teacher payout aggregation (legacy #283).
 *
 * Pure functions that derive what Katie owes each teacher in a period,
 * from existing data — no new entity. Two sources feed this:
 *   1. Paid private-pay invoices: each `lineItem` with a `lessonId`
 *      generates a payout line for whichever teacher actually taught
 *      that lesson (substitute-aware via `wasTaughtBySubstitute`).
 *   2. Rendered Hope-Scholarship lessons: Hope students are invoiced
 *      externally through EMA, so the lesson itself is the signal; the
 *      base revenue is the price of the student's EMA product. A Hope
 *      student on no product has no price, so their lessons are listed
 *      as unpriced (#83). A flat or hourly teacher is still paid for
 *      them, since that pay never depended on the price; a percentage
 *      teacher's share waits, out of the total, until a product is set.
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
import type { Lesson } from './lesson';
import { isSubmittableToHope } from './lesson';
import { wasTaughtBySubstitute } from './lesson';
import type { Student } from './student';
import type { HopeProduct } from './hope-product';
import { resolveHopeLessonRate } from './hope-product';

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
   * teacher's `payRate` / `payRateType` are not configured (the UI
   * surfaces that as "Rate not set" rather than silently dropping), or
   * when a percentage share has no price to be a share of (an unpriced
   * Hope lesson).
   */
  compensationCents: number | undefined;
  /**
   * Base revenue the compensation derives from: the invoice-line subtotal, or
   * the Hope student's EMA product price. Undefined for a Hope lesson whose
   * student is on no EMA product: it has no price, never a guess. Flat and
   * hourly pay is still computed for it; a percentage share is not.
   */
  baseRevenueCents: number | undefined;
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
  /**
   * Hope lessons this teacher taught whose student is on no EMA product.
   * All of them need a product before EMA can be billed, so the UI asks
   * for one; whether the teacher is paid for them is
   * `unpricedHopePayPendingCount`.
   */
  unpricedHopeLessonCount: number;
  /**
   * The subset of `unpricedHopeLessonCount` whose pay is waiting on a price
   * (a percentage teacher): no compensation, not in `totalOwedCents`. Zero
   * for a flat or hourly teacher, who is paid for them as usual.
   */
  unpricedHopePayPendingCount: number;
  lines: TeacherPayoutLine[];
}

export interface AggregateTeacherPayoutsInput {
  /** Lessons to consider (caller decides date filter; aggregation filters by status + source). */
  lessons: Lesson[];
  /** Invoices to consider (caller pre-filters to status=paid + paidAt in range). */
  paidInvoices: Invoice[];
  students: Student[];
  instructors: Instructor[];
  /**
   * EMA products, so a Hope lesson's base revenue is what EMA pays for the
   * student's product. Omitted or unmatched, the lesson is unpriced.
   */
  hopeProducts?: HopeProduct[];
  /** Optional restriction to a single teacher. */
  teacherIdFilter?: string;
  /** What "has happened" is measured against (#157). Defaults to the clock. */
  now?: Date;
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
 * Whether this teacher's pay is a share of the lesson's price. Only then does
 * a lesson with no price leave the teacher's pay unknown.
 */
export function payDependsOnPrice(
  instructor: Pick<Instructor, 'payRateType'>
): boolean {
  return instructor.payRateType === 'percentage';
}

/**
 * Lessons with these statuses are excluded from payouts entirely:
 * cancelled never earns the teacher anything; scheduled isn't paid yet
 * (private) or rendered yet (Hope).
 *
 * A **no-show** splits the two sources, which is the whole point of it being
 * its own status (legacy #796): a private-pay no-show is billed, so once that invoice
 * is paid the teacher is owed their share; a Hope no-show is billed to nobody
 * and therefore earns nothing.
 */
export function isLessonPayoutEligible(
  lesson: Pick<Lesson, 'status' | 'scheduledAt'>,
  source: TeacherPayoutLineSource,
  now: Date
): boolean {
  if (source === 'private-paid') {
    // Private-pay eligibility is keyed on the invoice being paid, not
    // the lesson status — we accept any lesson status except cancelled.
    return lesson.status !== 'cancelled';
  }
  // Hope — the lesson itself must genuinely have happened. Routed through the
  // shared helper so this and the EMA submission queue (legacy #799) can never
  // disagree about what Hope may be billed for.
  return isSubmittableToHope(lesson, now);
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
  const now = input.now ?? new Date();

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
      if (!isLessonPayoutEligible(lesson, 'private-paid', now)) continue;

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
  const hopeProductsById = new Map(
    (input.hopeProducts ?? []).map((p) => [p.id, p])
  );
  for (const lesson of lessons) {
    if (!isLessonPayoutEligible(lesson, 'hope-rendered', now)) continue;
    if (privatePaidLessonIds.has(lesson.id)) continue; // already counted as private-paid

    const student = studentsById.get(lesson.studentId);
    if (!student || !student.isHopeScholarship) continue;

    const teacher = instructorsById.get(lesson.teacherId);
    if (!teacher) continue;
    if (teacherIdFilter && teacher.id !== teacherIdFilter) continue;

    // No EMA product, no price. Flat and hourly pay never depended on the
    // price, so it is owed as usual; a percentage share of no price waits
    // until Katie puts the student on a product. Never a guessed base.
    const baseRevenueCents = resolveHopeLessonRate(
      student,
      hopeProductsById
    ).rateCents;
    const compensationCents =
      baseRevenueCents !== undefined
        ? computeLessonCompensationCents(teacher, lesson, baseRevenueCents)
        : payDependsOnPrice(teacher)
          ? undefined
          : computeLessonCompensationCents(teacher, lesson, 0);

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
    // From the teacher, not the lines: an unpriced Hope line has no
    // compensation either, and must not read as a missing pay rate.
    const missingRateConfig =
      computeLessonCompensationCents(teacher, { durationMinutes: 0 }, 0) ===
      undefined;
    const unpriced = sortedLines.filter((l) => l.baseRevenueCents === undefined);
    const unpricedHopeLessonCount = unpriced.length;
    // Waiting on a price, as opposed to waiting on a pay rate.
    const unpricedHopePayPendingCount = missingRateConfig
      ? 0
      : unpriced.filter((l) => l.compensationCents === undefined).length;

    payouts.push({
      teacherId,
      teacherName: teacher.name,
      totalOwedCents,
      missingRateConfig,
      unpricedHopeLessonCount,
      unpricedHopePayPendingCount,
      lines: sortedLines,
    });
  }

  // Sort payouts by total owed descending (biggest obligation first)
  return payouts.sort((a, b) => b.totalOwedCents - a.totalOwedCents);
}
