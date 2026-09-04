/**
 * getNeedsAttention Cloud Function (#807)
 *
 * Six states already existed as data and none of them surfaced as a to-do, so
 * finding any of them meant going looking, per student. Every one is money or
 * compliance quietly going wrong — an invoice that never reached Square means
 * the family was never asked to pay at all.
 *
 * WHY THIS FETCHES EVERYTHING
 * ---------------------------
 * It reads students, lessons, blocks and invoices unfiltered and composes in
 * memory, the way `getTeacherPayouts` already does. That is deliberate: the
 * alternative is six filtered queries, most of them multi-field, each needing
 * its own composite index for a studio whose entire dataset is a few hundred
 * documents. Revisit if this ever gets slow; do not pre-optimise it into six
 * indexes first.
 *
 * SCOPING
 * -------
 * An admin sees everything. A lesson teacher sees only their own students and
 * their own lessons (`instructorIdForUser`, per #616). The response says which,
 * because an empty panel means two different things to those two people.
 */
import { Functions, Role, instructorIdForUser } from '@maple/firebase/functions';
import {
  HopeSubmissionRepository,
  InvoiceRepository,
  LessonBlockRepository,
  LessonRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  hasInvoiceSyncFailed,
  isHopeUnsubmitted,
  isInvoiceOverdue,
  isLessonUnattributed,
  isLessonUnbilled,
  needsAutoInvoiceEnabled,
  sortAttentionGroups,
  totalAttentionCount,
} from '@maple/ts/domain';
import type {
  NeedsAttentionGroup,
  NeedsAttentionRow,
} from '@maple/ts/domain';
import type {
  GetNeedsAttentionRequest,
  GetNeedsAttentionResponse,
} from '@maple/ts/firebase/api-types';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const getNeedsAttention = Functions.endpoint
  .requiringRole([Role.Admin, Role.LessonTeacher])
  .handle<GetNeedsAttentionRequest, GetNeedsAttentionResponse>(
    async (_data, context) => {
      const now = new Date();

      // An admin has no linked instructor record, so this is undefined for them
      // and defined for a lesson teacher — which is exactly the scoping test.
      const ownInstructorId = await instructorIdForUser(context?.uid);
      const scopedToSelf = Boolean(ownInstructorId);

      const [allStudents, allLessons, blocks, allInvoices] = await Promise.all([
        StudentRepository.findAll(),
        LessonRepository.findAll(),
        LessonBlockRepository.findAll(),
        InvoiceRepository.findAll(),
      ]);

      const students = scopedToSelf
        ? allStudents.filter((s) => s.primaryTeacherId === ownInstructorId)
        : allStudents;
      const studentIds = new Set(students.map((s) => s.id));
      const studentById = new Map(students.map((s) => [s.id, s]));

      const lessons = allLessons.filter(
        (l) =>
          studentIds.has(l.studentId) &&
          (!scopedToSelf || l.teacherId === ownInstructorId)
      );
      const invoices = allInvoices.filter((i) => studentIds.has(i.studentId));

      // Every lesson referenced by a non-void invoice line, so "taught but
      // never billed" is answered without a query per lesson.
      const invoicedLessonIds = new Set<string>();
      for (const invoice of invoices) {
        if (invoice.status === 'void') continue;
        for (const line of invoice.lineItems) {
          if (line.lessonId) invoicedLessonIds.add(line.lessonId);
        }
      }

      const hopeLessons = lessons.filter(
        (l) => studentById.get(l.studentId)?.isHopeScholarship
      );
      const hopeSubmissions = await HopeSubmissionRepository.findByLessonIds(
        hopeLessons.map((l) => l.id)
      );

      const nameFor = (studentId: string) =>
        studentById.get(studentId)?.name ?? 'Unknown student';

      const syncFailed: NeedsAttentionRow[] = invoices
        .filter(hasInvoiceSyncFailed)
        .map((invoice) => ({
          kind: 'invoice-sync-failed' as const,
          id: invoice.id,
          label: nameFor(invoice.studentId),
          detail: `${formatCents(invoice.totalCents)} · ${invoice.squareSyncError ?? ''}`,
          href: `/students/${invoice.studentId}`,
          resolution: 'navigate' as const,
          amountCents: invoice.totalCents,
        }));

      const unbilled: NeedsAttentionRow[] = lessons
        .filter((lesson) => {
          const student = studentById.get(lesson.studentId);
          return (
            student !== undefined &&
            isLessonUnbilled(lesson, student, invoicedLessonIds)
          );
        })
        .map((lesson) => ({
          kind: 'lesson-unbilled' as const,
          id: lesson.id,
          label: nameFor(lesson.studentId),
          detail: `${lesson.status === 'no-show' ? 'Missed' : 'Taught'} ${formatDate(lesson.scheduledAt)}, never invoiced`,
          href: `/students/${lesson.studentId}`,
          resolution: 'navigate' as const,
          teacherId: lesson.teacherId,
        }));

      const hopeUnsubmitted: NeedsAttentionRow[] = hopeLessons
        .filter((lesson) =>
          isHopeUnsubmitted(lesson, hopeSubmissions.get(lesson.id)?.status)
        )
        .map((lesson) => ({
          kind: 'hope-unsubmitted' as const,
          id: lesson.id,
          label: nameFor(lesson.studentId),
          detail:
            hopeSubmissions.get(lesson.id)?.status === 'rejected'
              ? `${formatDate(lesson.scheduledAt)} · EMA rejected, needs resubmitting`
              : `Taught ${formatDate(lesson.scheduledAt)}, not yet claimed`,
          href: '/hope',
          resolution: 'navigate' as const,
          teacherId: lesson.teacherId,
        }));

      const overdue: NeedsAttentionRow[] = invoices
        .filter((invoice) => isInvoiceOverdue(invoice, now))
        .map((invoice) => ({
          kind: 'invoice-overdue' as const,
          id: invoice.id,
          label: nameFor(invoice.studentId),
          detail: `${formatCents(invoice.totalCents)} sent ${invoice.issuedAt ? formatDate(invoice.issuedAt) : ''}`,
          href: `/students/${invoice.studentId}`,
          resolution: 'navigate' as const,
          amountCents: invoice.totalCents,
        }));

      const unattributed: NeedsAttentionRow[] = lessons
        .filter(
          (lesson) =>
            lesson.status !== 'cancelled' &&
            blocks.length > 0 &&
            isLessonUnattributed(lesson, blocks)
        )
        .map((lesson) => ({
          kind: 'lesson-unattributed' as const,
          id: lesson.id,
          label: nameFor(lesson.studentId),
          detail: `${formatDate(lesson.scheduledAt)} sits in no block`,
          href: `/students/${lesson.studentId}`,
          resolution: 'navigate' as const,
          teacherId: lesson.teacherId,
        }));

      const autoInvoiceOff: NeedsAttentionRow[] = students
        .filter(needsAutoInvoiceEnabled)
        .map((student) => ({
          kind: 'student-autoinvoice-off' as const,
          id: student.id,
          label: student.name,
          detail: 'Lessons will not bill automatically',
          // The only one the panel can fix itself: it is a single boolean.
          resolution: 'inline' as const,
        }));

      const groups: NeedsAttentionGroup[] = [
        {
          kind: 'invoice-sync-failed',
          title: 'Invoices that never reached Square',
          because: 'The family was never asked to pay.',
          rows: syncFailed,
        },
        {
          kind: 'lesson-unbilled',
          title: 'Lessons taught but never invoiced',
          because:
            'Usually means no rate resolved for the student, so the auto-invoice skipped.',
          rows: unbilled,
        },
        {
          kind: 'hope-unsubmitted',
          title: 'Hope lessons not yet claimed',
          because: 'Taught, and the state has not been asked to pay for them.',
          rows: hopeUnsubmitted,
        },
        {
          kind: 'invoice-overdue',
          title: 'Invoices unpaid for two weeks',
          because: 'Sent, and nobody is chasing them.',
          rows: overdue,
        },
        {
          kind: 'lesson-unattributed',
          title: 'Lessons with no block',
          because:
            'They do not appear in the openings finder and skew the weekly view.',
          rows: unattributed,
        },
        {
          kind: 'student-autoinvoice-off',
          title: 'Students who will not bill automatically',
          because: 'Every future lesson for them has to be invoiced by hand.',
          rows: autoInvoiceOff,
        },
      ];

      const sorted = sortAttentionGroups(groups);

      return {
        groups: sorted,
        total: totalAttentionCount(sorted),
        scopedToSelf,
      };
    }
  );
