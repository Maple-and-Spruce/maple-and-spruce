/**
 * Get My Day Lessons Cloud Function (#631)
 *
 * The signed-in lesson teacher's own lessons for a day, each enriched with the
 * student name and the invoice tied to the lesson — assembled server-side
 * because the client can't resolve which instructor the user is (getMyRoles
 * returns only roles). Also returns the business Venmo handle for the
 * pay-by-Venmo QR.
 *
 * Role-gated [Admin, LessonTeacher]; scoped to the caller's linked instructor
 * (an admin who isn't linked to any instructor simply sees no lessons).
 */
import { Role, createRoleFunction, instructorIdForUser } from '@maple/firebase/functions';
import {
  BusinessPaymentConfigRepository,
  InvoiceRepository,
  LessonRepository,
  StudentRepository,
} from '@maple/firebase/database';
import type { Invoice } from '@maple/ts/domain';
import type {
  GetMyDayLessonsRequest,
  GetMyDayLessonsResponse,
  MyDayLesson,
} from '@maple/ts/firebase/api-types';

function invoiceForLesson(
  invoices: Invoice[],
  lessonId: string
): Invoice | undefined {
  return invoices.find(
    (inv) =>
      inv.status !== 'void' &&
      inv.lineItems.some((line) => line.lessonId === lessonId)
  );
}

export const getMyDayLessons = createRoleFunction<
  GetMyDayLessonsRequest,
  GetMyDayLessonsResponse
>(async (data, context) => {
  const { venmoHandle } = await BusinessPaymentConfigRepository.get();

  const myInstructorId = await instructorIdForUser(context.uid);
  if (!myInstructorId) {
    // A caller not linked to any instructor (e.g. a pure admin) has no "my day".
    return { lessons: [], venmoHandle, unlinked: true };
  }

  const now = new Date();
  const from = data.from
    ? new Date(data.from)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = data.to
    ? new Date(data.to)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const lessons = await LessonRepository.findAll({
    teacherId: myInstructorId,
    from,
    to,
  });
  lessons.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  // Fetch each student's invoices once (a teacher's day repeats students).
  const studentIds = [...new Set(lessons.map((l) => l.studentId))];
  const [students, invoicesByStudent] = await Promise.all([
    Promise.all(studentIds.map((id) => StudentRepository.findById(id))),
    Promise.all(
      studentIds.map((id) => InvoiceRepository.findAll({ studentId: id }))
    ),
  ]);
  const nameById = new Map<string, string>();
  const invoicesById = new Map<string, Invoice[]>();
  studentIds.forEach((id, i) => {
    nameById.set(id, students[i]?.name ?? 'Unknown student');
    invoicesById.set(id, invoicesByStudent[i]);
  });

  const myDay: MyDayLesson[] = lessons.map((lesson) => {
    const invoice = invoiceForLesson(
      invoicesById.get(lesson.studentId) ?? [],
      lesson.id
    );
    return {
      lesson,
      studentId: lesson.studentId,
      studentName: nameById.get(lesson.studentId) ?? 'Unknown student',
      invoice: invoice
        ? {
            id: invoice.id,
            status: invoice.status,
            source: invoice.paymentRecord?.source,
            totalCents: invoice.totalCents,
          }
        : undefined,
    };
  });

  return { lessons: myDay, venmoHandle, unlinked: false };
}, [Role.Admin, Role.LessonTeacher]);
