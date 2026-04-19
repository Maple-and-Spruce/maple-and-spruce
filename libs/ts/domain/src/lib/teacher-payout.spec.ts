import { describe, it, expect } from 'vitest';
import {
  aggregateTeacherPayouts,
  computeLessonCompensationCents,
  hopeLessonBaseRevenueCents,
  isLessonPayoutEligible,
} from './teacher-payout';
import type { Instructor } from './instructor';
import type { Invoice } from './invoice';
import type { Lesson } from './lesson';
import type { Student } from './student';

// --- Fixtures ---------------------------------------------------------

const makeInstructor = (overrides: Partial<Instructor> = {}): Instructor => ({
  id: 'instructor-1',
  name: 'Sarah',
  email: 'sarah@x.com',
  status: 'active',
  payRate: 5000,
  payRateType: 'flat',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeStudent = (overrides: Partial<Student> = {}): Student => ({
  id: 'student-1',
  name: 'Olive',
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-1',
  isHopeScholarship: false,
  primaryContactName: 'Rita',
  primaryContactEmail: 'rita@x.com',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeLesson = (overrides: Partial<Lesson> = {}): Lesson => ({
  id: 'lesson-1',
  studentId: 'student-1',
  scheduledAt: new Date('2026-04-14T15:00:00Z'),
  durationMinutes: 30,
  teacherId: 'instructor-1',
  primaryTeacherAtCreateId: 'instructor-1',
  status: 'scheduled',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  studentId: 'student-1',
  status: 'paid',
  lineItems: [],
  totalCents: 0,
  paidAt: new Date('2026-04-20T10:00:00Z'),
  issuedAt: new Date('2026-04-15T10:00:00Z'),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// --- hopeLessonBaseRevenueCents ---------------------------------------

describe('hopeLessonBaseRevenueCents', () => {
  it('uses the student registered tier when set', () => {
    expect(
      hopeLessonBaseRevenueCents(
        { durationMinutes: 30 },
        { registeredLessonLength: '30-min-initial' }
      )
    ).toBe(3250);
  });

  it('falls back to duration-derived tier when registered tier is unset', () => {
    // 30 min with no registered tier → defaults to 30-min-full rate.
    expect(
      hopeLessonBaseRevenueCents(
        { durationMinutes: 30 },
        { registeredLessonLength: undefined }
      )
    ).toBe(4125);

    expect(
      hopeLessonBaseRevenueCents(
        { durationMinutes: 45 },
        { registeredLessonLength: undefined }
      )
    ).toBe(5875);

    expect(
      hopeLessonBaseRevenueCents(
        { durationMinutes: 60 },
        { registeredLessonLength: undefined }
      )
    ).toBe(7500);
  });
});

// --- computeLessonCompensationCents -----------------------------------

describe('computeLessonCompensationCents', () => {
  it('returns flat payRate regardless of duration or base revenue', () => {
    const instructor = makeInstructor({ payRate: 5000, payRateType: 'flat' });
    expect(computeLessonCompensationCents(instructor, { durationMinutes: 30 }, 13000)).toBe(5000);
    expect(computeLessonCompensationCents(instructor, { durationMinutes: 60 }, 0)).toBe(5000);
  });

  it('scales hourly payRate by duration', () => {
    const instructor = makeInstructor({ payRate: 6000, payRateType: 'hourly' });
    // 30 min = 0.5 hr × $60 = $30
    expect(computeLessonCompensationCents(instructor, { durationMinutes: 30 }, 0)).toBe(3000);
    // 45 min = 0.75 hr × $60 = $45
    expect(computeLessonCompensationCents(instructor, { durationMinutes: 45 }, 0)).toBe(4500);
  });

  it('applies percentage payRate to base revenue', () => {
    const instructor = makeInstructor({ payRate: 0.7, payRateType: 'percentage' });
    expect(computeLessonCompensationCents(instructor, { durationMinutes: 30 }, 13000)).toBe(9100);
  });

  it('returns undefined when payRate is not configured', () => {
    const instructor = makeInstructor({
      payRate: undefined,
      payRateType: undefined,
    });
    expect(computeLessonCompensationCents(instructor, { durationMinutes: 30 }, 5000)).toBeUndefined();
  });
});

// --- isLessonPayoutEligible -------------------------------------------

describe('isLessonPayoutEligible', () => {
  it('private-paid: any status except cancelled is eligible', () => {
    expect(isLessonPayoutEligible('scheduled', 'private-paid')).toBe(true);
    expect(isLessonPayoutEligible('rendered', 'private-paid')).toBe(true);
    expect(isLessonPayoutEligible('cancelled', 'private-paid')).toBe(false);
  });

  it('hope-rendered: only rendered is eligible', () => {
    expect(isLessonPayoutEligible('rendered', 'hope-rendered')).toBe(true);
    expect(isLessonPayoutEligible('scheduled', 'hope-rendered')).toBe(false);
    expect(isLessonPayoutEligible('cancelled', 'hope-rendered')).toBe(false);
  });
});

// --- aggregateTeacherPayouts ------------------------------------------

describe('aggregateTeacherPayouts', () => {
  it('returns an empty list when no inputs', () => {
    expect(
      aggregateTeacherPayouts({
        lessons: [],
        paidInvoices: [],
        students: [],
        instructors: [],
      })
    ).toEqual([]);
  });

  describe('private-paid aggregation', () => {
    it('emits a line per lesson-linked invoice line item, totals per teacher', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({ id: 'l1', teacherId: 'instructor-1' }),
          makeLesson({ id: 'l2', teacherId: 'instructor-1' }),
        ],
        paidInvoices: [
          makeInvoice({
            id: 'inv-1',
            lineItems: [
              {
                id: 'line-1',
                description: 'Lesson 1',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
              {
                id: 'line-2',
                description: 'Lesson 2',
                lessonId: 'l2',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [makeInstructor({ id: 'instructor-1', payRate: 5000, payRateType: 'flat' })],
      });

      expect(result).toHaveLength(1);
      expect(result[0].teacherId).toBe('instructor-1');
      expect(result[0].lines).toHaveLength(2);
      expect(result[0].totalOwedCents).toBe(10000); // 2 × $50 flat
      expect(result[0].lines.every((l) => l.source === 'private-paid')).toBe(true);
    });

    it('skips free-form invoice lines (no lessonId)', () => {
      const result = aggregateTeacherPayouts({
        lessons: [makeLesson({ id: 'l1' })],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'free-form',
                description: 'Recital fee',
                quantity: 1,
                unitAmountCents: 2500,
                subtotalCents: 2500,
                // no lessonId
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [makeInstructor()],
      });
      expect(result).toEqual([]);
    });

    it('skips cancelled lessons even when the invoice is paid', () => {
      const result = aggregateTeacherPayouts({
        lessons: [makeLesson({ id: 'l1', status: 'cancelled' })],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'line-1',
                description: 'Cancelled lesson',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [makeInstructor()],
      });
      expect(result).toEqual([]);
    });

    it('skips non-paid invoices defensively even if passed in', () => {
      const result = aggregateTeacherPayouts({
        lessons: [makeLesson({ id: 'l1' })],
        paidInvoices: [
          makeInvoice({
            status: 'sent' as const,
            lineItems: [
              {
                id: 'line-1',
                description: 'Unpaid lesson',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [makeInstructor()],
      });
      expect(result).toEqual([]);
    });

    it('flags lines as asSubstitute when teacherId differs from primaryTeacherAtCreateId', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({
            id: 'l1',
            teacherId: 'instructor-sub',
            primaryTeacherAtCreateId: 'instructor-primary',
          }),
        ],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'line-1',
                description: 'Sub-taught lesson',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent({ primaryTeacherId: 'instructor-primary' })],
        instructors: [
          makeInstructor({ id: 'instructor-primary' }),
          makeInstructor({ id: 'instructor-sub', name: 'James' }),
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].teacherId).toBe('instructor-sub');
      expect(result[0].lines[0].asSubstitute).toBe(true);
    });
  });

  describe('Hope-rendered aggregation', () => {
    it('emits a line per rendered Hope lesson using the Hope rate', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({
            id: 'l1',
            status: 'rendered',
            durationMinutes: 30,
          }),
          makeLesson({
            id: 'l2',
            status: 'rendered',
            durationMinutes: 45,
          }),
        ],
        paidInvoices: [],
        students: [
          makeStudent({
            isHopeScholarship: true,
            registeredLessonLength: '30-min-full',
          }),
        ],
        instructors: [makeInstructor({ payRate: 0.6, payRateType: 'percentage' })],
      });

      expect(result).toHaveLength(1);
      expect(result[0].lines).toHaveLength(2);
      expect(result[0].lines.every((l) => l.source === 'hope-rendered')).toBe(true);
      // l1 (30-min-full): $41.25 × 0.6 = $24.75
      // l2: baseRevenue comes from registered tier (30-min-full) → still $41.25 × 0.6 = $24.75
      expect(result[0].totalOwedCents).toBe(4950);
    });

    it('skips scheduled-but-not-rendered Hope lessons', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({
            id: 'l1',
            status: 'scheduled',
          }),
        ],
        paidInvoices: [],
        students: [
          makeStudent({
            isHopeScholarship: true,
            registeredLessonLength: '30-min-full',
          }),
        ],
        instructors: [makeInstructor()],
      });
      expect(result).toEqual([]);
    });

    it('skips rendered lessons for non-Hope students (no invoice yet = no payout)', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({
            id: 'l1',
            status: 'rendered',
          }),
        ],
        paidInvoices: [],
        students: [makeStudent({ isHopeScholarship: false })],
        instructors: [makeInstructor()],
      });
      expect(result).toEqual([]);
    });

    it('falls back to duration-based Hope tier when student has no registeredLessonLength', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({
            id: 'l1',
            status: 'rendered',
            durationMinutes: 60,
          }),
        ],
        paidInvoices: [],
        students: [
          makeStudent({
            isHopeScholarship: true,
            registeredLessonLength: undefined,
          }),
        ],
        instructors: [makeInstructor({ payRate: 0.6, payRateType: 'percentage' })],
      });

      expect(result).toHaveLength(1);
      // 60-min default → $75 × 0.6 = $45
      expect(result[0].totalOwedCents).toBe(4500);
      expect(result[0].lines[0].baseRevenueCents).toBe(7500);
    });

    it('does not double-count a lesson that is already on a paid invoice', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({
            id: 'l1',
            status: 'rendered',
          }),
        ],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'line-1',
                description: 'Lesson 1',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [
          makeStudent({
            isHopeScholarship: true,
            registeredLessonLength: '30-min-full',
          }),
        ],
        instructors: [makeInstructor({ payRate: 5000, payRateType: 'flat' })],
      });

      expect(result[0].lines).toHaveLength(1);
      expect(result[0].lines[0].source).toBe('private-paid');
    });
  });

  describe('teacherIdFilter', () => {
    it('includes only the target teacher', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({ id: 'l1', teacherId: 'instructor-1' }),
          makeLesson({ id: 'l2', teacherId: 'instructor-2' }),
        ],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'line-1',
                description: 'Lesson 1',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
              {
                id: 'line-2',
                description: 'Lesson 2',
                lessonId: 'l2',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [
          makeInstructor({ id: 'instructor-1' }),
          makeInstructor({ id: 'instructor-2', name: 'James' }),
        ],
        teacherIdFilter: 'instructor-2',
      });

      expect(result).toHaveLength(1);
      expect(result[0].teacherId).toBe('instructor-2');
    });
  });

  describe('missing rate config', () => {
    it('sets missingRateConfig=true when every line is undefined', () => {
      const result = aggregateTeacherPayouts({
        lessons: [makeLesson({ id: 'l1' })],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'line-1',
                description: 'Lesson',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [
          makeInstructor({ payRate: undefined, payRateType: undefined }),
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].missingRateConfig).toBe(true);
      expect(result[0].totalOwedCents).toBe(0);
    });
  });

  describe('skips missing refs', () => {
    it('skips a lesson whose teacher has been removed', () => {
      const result = aggregateTeacherPayouts({
        lessons: [makeLesson({ id: 'l1', teacherId: 'deleted-instructor' })],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'line-1',
                description: 'Orphan',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [], // no instructors at all
      });
      expect(result).toEqual([]);
    });

    it('skips an invoice line whose lessonId has no matching lesson', () => {
      const result = aggregateTeacherPayouts({
        lessons: [], // no lessons
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'line-1',
                description: 'Orphan',
                lessonId: 'lesson-missing',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [makeInstructor()],
      });
      expect(result).toEqual([]);
    });

    it('handles a paid invoice line whose student has been deleted', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({ id: 'l1', studentId: 'student-deleted' }),
        ],
        paidInvoices: [
          makeInvoice({
            studentId: 'student-deleted',
            lineItems: [
              {
                id: 'line-1',
                description: 'Lesson',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [], // student gone
        instructors: [makeInstructor()],
      });

      // Teacher still gets paid; student name falls back.
      expect(result).toHaveLength(1);
      expect(result[0].lines[0].studentName).toBe('(unknown student)');
      expect(result[0].lines[0].asSubstitute).toBe(false); // no snapshot + no student = false
    });
  });

  describe('sort order', () => {
    it('sorts payouts by totalOwedCents desc', () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({ id: 'l1', teacherId: 'instructor-small' }),
          makeLesson({ id: 'l2', teacherId: 'instructor-big' }),
          makeLesson({ id: 'l3', teacherId: 'instructor-big' }),
        ],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'l1',
                description: 'Small',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
              {
                id: 'l2',
                description: 'Big1',
                lessonId: 'l2',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
              {
                id: 'l3',
                description: 'Big2',
                lessonId: 'l3',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [
          makeInstructor({ id: 'instructor-small', name: 'Small' }),
          makeInstructor({ id: 'instructor-big', name: 'Big' }),
        ],
      });

      expect(result.map((p) => p.teacherId)).toEqual([
        'instructor-big',
        'instructor-small',
      ]);
    });

    it("sorts each teacher's lines newest-first", () => {
      const result = aggregateTeacherPayouts({
        lessons: [
          makeLesson({
            id: 'l1',
            scheduledAt: new Date('2026-04-01T15:00:00Z'),
          }),
          makeLesson({
            id: 'l2',
            scheduledAt: new Date('2026-04-15T15:00:00Z'),
          }),
        ],
        paidInvoices: [
          makeInvoice({
            lineItems: [
              {
                id: 'old',
                description: 'Old',
                lessonId: 'l1',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
              {
                id: 'new',
                description: 'New',
                lessonId: 'l2',
                quantity: 1,
                unitAmountCents: 4000,
                subtotalCents: 4000,
              },
            ],
          }),
        ],
        students: [makeStudent()],
        instructors: [makeInstructor()],
      });

      expect(result[0].lines.map((l) => l.lessonId)).toEqual(['l2', 'l1']);
    });
  });
});
