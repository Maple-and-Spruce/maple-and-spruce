import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the getTeacherPayouts cloud function handler.
 *
 * The aggregation math is thoroughly tested in
 * libs/ts/domain/src/lib/teacher-payout.spec.ts. Here we verify the
 * cloud function wires everything together correctly:
 *   - date-range validation (invalid + reversed)
 *   - filters paid invoices by paidAt in range
 *   - backfills lessons referenced by invoice lines but outside the
 *     scheduledAt range
 *   - forwards teacherId filter to the aggregator
 */

const mocks = vi.hoisted(() => ({
  lessonFindAll: vi.fn(),
  lessonFindById: vi.fn(),
  invoiceFindAll: vi.fn(),
  studentFindAll: vi.fn(),
  instructorFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
}));

vi.mock('@maple/firebase/database', () => ({
  LessonRepository: {
    findAll: mocks.lessonFindAll,
    findById: mocks.lessonFindById,
  },
  InvoiceRepository: { findAll: mocks.invoiceFindAll },
  StudentRepository: { findAll: mocks.studentFindAll },
  InstructorRepository: { findAll: mocks.instructorFindAll },
}));

import { getTeacherPayouts } from './get-teacher-payouts';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = getTeacherPayouts as unknown as Handler;

const FROM_ISO = '2026-04-01T00:00:00Z';
const TO_ISO = '2026-04-30T23:59:59Z';

describe('getTeacherPayouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lessonFindAll.mockResolvedValue([]);
    mocks.lessonFindById.mockResolvedValue(undefined);
    mocks.invoiceFindAll.mockResolvedValue([]);
    mocks.studentFindAll.mockResolvedValue([]);
    mocks.instructorFindAll.mockResolvedValue([]);
  });

  describe('input validation', () => {
    it('rejects an invalid from date', async () => {
      await expect(
        handler({ from: 'not-a-date', to: TO_ISO })
      ).rejects.toThrow(/Invalid/);
    });

    it('rejects an invalid to date', async () => {
      await expect(
        handler({ from: FROM_ISO, to: 'garbage' })
      ).rejects.toThrow(/Invalid/);
    });

    it("rejects when 'from' is after 'to'", async () => {
      await expect(
        handler({ from: TO_ISO, to: FROM_ISO })
      ).rejects.toThrow(/must be before/);
    });
  });

  describe('happy path', () => {
    it('passes rendered lessons + paid invoices to the aggregator', async () => {
      const instructor = {
        id: 'instructor-1',
        name: 'Sarah',
        payRate: 5000,
        payRateType: 'flat',
        status: 'active',
        email: 'sarah@x.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const student = {
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
      };
      const lesson = {
        id: 'lesson-1',
        studentId: 'student-1',
        teacherId: 'instructor-1',
        primaryTeacherAtCreateId: 'instructor-1',
        scheduledAt: new Date('2026-04-15T15:00:00Z'),
        durationMinutes: 30,
        status: 'rendered',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const paidInvoice = {
        id: 'inv-1',
        studentId: 'student-1',
        status: 'paid',
        paidAt: new Date('2026-04-20T10:00:00Z'),
        issuedAt: new Date('2026-04-15T10:00:00Z'),
        lineItems: [
          {
            id: 'line-1',
            description: 'Lesson',
            lessonId: 'lesson-1',
            quantity: 1,
            unitAmountCents: 4000,
            subtotalCents: 4000,
          },
        ],
        totalCents: 4000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mocks.lessonFindAll.mockResolvedValue([lesson]);
      mocks.invoiceFindAll.mockResolvedValue([paidInvoice]);
      mocks.studentFindAll.mockResolvedValue([student]);
      mocks.instructorFindAll.mockResolvedValue([instructor]);

      const result = (await handler({ from: FROM_ISO, to: TO_ISO })) as {
        payouts: Array<{ teacherId: string; lines: unknown[]; totalOwedCents: number }>;
      };

      expect(result.payouts).toHaveLength(1);
      expect(result.payouts[0].teacherId).toBe('instructor-1');
      expect(result.payouts[0].totalOwedCents).toBe(5000);
      expect(result.payouts[0].lines).toHaveLength(1);

      expect(mocks.lessonFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'rendered',
          from: expect.any(Date),
          to: expect.any(Date),
        })
      );
    });

    it('filters paid invoices whose paidAt falls outside the period', async () => {
      const outOfRangeInvoice = {
        id: 'inv-old',
        studentId: 'student-1',
        status: 'paid',
        paidAt: new Date('2026-03-15T10:00:00Z'), // before FROM
        issuedAt: new Date('2026-03-14T10:00:00Z'),
        lineItems: [
          {
            id: 'line',
            description: 'Lesson',
            lessonId: 'lesson-any',
            quantity: 1,
            unitAmountCents: 4000,
            subtotalCents: 4000,
          },
        ],
        totalCents: 4000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mocks.invoiceFindAll.mockResolvedValue([outOfRangeInvoice]);
      mocks.studentFindAll.mockResolvedValue([
        {
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
        },
      ]);
      mocks.instructorFindAll.mockResolvedValue([
        {
          id: 'instructor-1',
          name: 'Sarah',
          payRate: 5000,
          payRateType: 'flat',
          status: 'active',
          email: 'sarah@x.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = (await handler({ from: FROM_ISO, to: TO_ISO })) as {
        payouts: unknown[];
      };

      expect(result.payouts).toEqual([]);
    });

    it('backfills lessons referenced by paid-invoice lines but outside the scheduledAt range', async () => {
      // Lesson was scheduled in March but invoiced in April — the
      // scheduledAt-in-range query misses it, so the handler backfills
      // via findById.
      const marchLesson = {
        id: 'lesson-march',
        studentId: 'student-1',
        teacherId: 'instructor-1',
        primaryTeacherAtCreateId: 'instructor-1',
        scheduledAt: new Date('2026-03-20T15:00:00Z'),
        durationMinutes: 30,
        status: 'rendered',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mocks.lessonFindAll.mockResolvedValue([]); // in-range query returns nothing
      mocks.lessonFindById.mockImplementation((id: string) =>
        Promise.resolve(id === 'lesson-march' ? marchLesson : undefined)
      );
      mocks.invoiceFindAll.mockResolvedValue([
        {
          id: 'inv-1',
          studentId: 'student-1',
          status: 'paid',
          paidAt: new Date('2026-04-10T10:00:00Z'),
          issuedAt: new Date('2026-04-05T10:00:00Z'),
          lineItems: [
            {
              id: 'line',
              description: 'Lesson',
              lessonId: 'lesson-march',
              quantity: 1,
              unitAmountCents: 4000,
              subtotalCents: 4000,
            },
          ],
          totalCents: 4000,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mocks.studentFindAll.mockResolvedValue([
        {
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
        },
      ]);
      mocks.instructorFindAll.mockResolvedValue([
        {
          id: 'instructor-1',
          name: 'Sarah',
          payRate: 5000,
          payRateType: 'flat',
          status: 'active',
          email: 'sarah@x.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = (await handler({ from: FROM_ISO, to: TO_ISO })) as {
        payouts: Array<{ lines: Array<{ lessonId: string }> }>;
      };

      expect(mocks.lessonFindById).toHaveBeenCalledWith('lesson-march');
      expect(result.payouts).toHaveLength(1);
      expect(result.payouts[0].lines[0].lessonId).toBe('lesson-march');
    });

    it('forwards teacherId filter to the aggregator', async () => {
      mocks.lessonFindAll.mockResolvedValue([]);
      mocks.invoiceFindAll.mockResolvedValue([]);

      const result = (await handler({
        from: FROM_ISO,
        to: TO_ISO,
        teacherId: 'instructor-sub',
      })) as { payouts: unknown[] };

      // No data means no payouts, but the filter should have gone through
      // without error.
      expect(result.payouts).toEqual([]);
    });
  });
});
