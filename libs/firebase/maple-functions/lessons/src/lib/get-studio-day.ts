/**
 * Get Studio Day (#235)
 *
 * Every teacher's lessons for a day, for the admin Home dashboard's Today
 * card: each with the student's name and instrument, the teacher's name, and
 * where the lesson's money stands. `getMyDayLessons` is the teacher-scoped
 * twin; this one is admin-only because it spans every teacher.
 *
 * Cancelled lessons are left out. Payment comes from the student's lesson
 * charges first and their invoices as a fallback (`lessonPaymentState`).
 */
import {
  InstructorRepository,
  InstrumentsConfigRepository,
  InvoiceRepository,
  LessonRepository,
  LessonScheduledChargeRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  DEFAULT_LESSON_TIME_ZONE,
  instrumentLabel,
  lessonPaymentState,
  zonedDateKey,
  zonedWallClockToInstant,
} from '@maple/ts/domain';
import type {
  GetStudioDayRequest,
  GetStudioDayResponse,
  StudioDayLesson,
} from '@maple/ts/firebase/api-types';

/** Today's bounds in the shop timezone: midnight to the next midnight, less 1ms. */
export function shopDayBounds(
  now: Date,
  timeZone: string = DEFAULT_LESSON_TIME_ZONE,
): { from: Date; to: Date } {
  const [y, m, d] = zonedDateKey(now, timeZone).split('-').map(Number);
  const from = zonedWallClockToInstant(y, m, d, 0, timeZone);
  // Date.UTC normalises day overflow, so the last day of a month rolls over.
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStart = zonedWallClockToInstant(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    timeZone,
  );
  return { from, to: new Date(nextStart.getTime() - 1) };
}

export async function getStudioDay(
  data: GetStudioDayRequest,
): Promise<GetStudioDayResponse> {
  const today = shopDayBounds(new Date());
  const from = data?.from ? new Date(data.from) : today.from;
  const to = data?.to ? new Date(data.to) : today.to;

  const lessons = (await LessonRepository.findAll({ from, to })).filter(
    (l) => l.status !== 'cancelled',
  );
  lessons.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  if (lessons.length === 0) return { lessons: [] };

  const studentIds = [...new Set(lessons.map((l) => l.studentId))];
  const teacherIds = [...new Set(lessons.map((l) => l.teacherId))];

  const [students, teachers, chargesByStudent, invoicesByStudent, config] =
    await Promise.all([
      Promise.all(studentIds.map((id) => StudentRepository.findById(id))),
      Promise.all(teacherIds.map((id) => InstructorRepository.findById(id))),
      Promise.all(
        studentIds.map((id) =>
          LessonScheduledChargeRepository.findAll({ studentId: id }),
        ),
      ),
      Promise.all(
        studentIds.map((id) => InvoiceRepository.findAll({ studentId: id })),
      ),
      InstrumentsConfigRepository.get(),
    ]);

  const studentIndex = new Map(studentIds.map((id, i) => [id, i]));
  const teacherNameById = new Map(
    teacherIds.map((id, i) => [id, teachers[i]?.name ?? 'Unknown teacher']),
  );

  const day: StudioDayLesson[] = lessons.map((lesson) => {
    const i = studentIndex.get(lesson.studentId) ?? -1;
    const student = students[i];
    const payment = lessonPaymentState(
      lesson.id,
      chargesByStudent[i] ?? [],
      invoicesByStudent[i] ?? [],
    );
    return {
      lesson,
      studentName: student?.name ?? 'Unknown student',
      teacherName: teacherNameById.get(lesson.teacherId) ?? 'Unknown teacher',
      instrument: student?.instrument
        ? instrumentLabel(student.instrument, config.instruments)
        : undefined,
      payment: {
        state: payment.state,
        ...(payment.dueAt ? { dueAt: payment.dueAt.toISOString() } : {}),
      },
    };
  });

  return { lessons: day };
}
