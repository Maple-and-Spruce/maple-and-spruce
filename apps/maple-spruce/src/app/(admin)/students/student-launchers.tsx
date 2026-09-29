'use client';

/**
 * Row-action launchers for the students table.
 *
 * Katie's common jobs (edit the student, set the weekly slot, charge for past
 * lessons, line up the next ones) should not need a trip to the student page.
 * Each launcher is mounted only while its dialog is open and owns that one
 * student's hooks, so the table does not fetch per-student data for every row.
 *
 * The dialogs are the same components the student page uses, so the table and
 * the page cannot drift into two ways of doing one thing.
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import type {
  BlockStrategy,
  CreateInvoiceInput,
  CreateLessonInput,
  CreateLessonSeriesInput,
  Instructor,
  Lesson,
  LessonBlock,
  LessonRateByLength,
  Student,
  UpdateInvoiceInput,
} from '@maple/ts/domain';
import {
  lessonInvoiceLines,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';
import {
  CommitLessonsCard,
  ScheduleLessonDialog,
  StandingScheduleDialog,
  type CommitLessonsInvoiceInput,
  type CommitLessonsScope,
} from '@maple/react/lessons';
import { InvoiceBuilderDialog, newInvoiceLineId } from '@maple/react/invoices';
import {
  useInvoices,
  useLessonBilling,
  useLessons,
  useStudentLessonSchedules,
} from '../../../hooks';

/** Duration default from a student's registered lesson length. */
export function defaultDurationFor(student: Student): 30 | 45 | 60 {
  if (student.registeredLessonLength === '45-min') return 45;
  if (student.registeredLessonLength === '60-min') return 60;
  return 30;
}

/**
 * The invoice for a block of lessons, one line per lesson, sent straight away.
 *
 * Every line carries `lessonId`, which is what stops the same teaching also
 * being charged to a card, here or by the nightly job (#101).
 */
export function blockInvoiceInput(
  student: Student,
  { lessons, note }: CommitLessonsInvoiceInput,
  rateByLength: LessonRateByLength,
): CreateInvoiceInput {
  return {
    studentId: student.id,
    status: 'sent',
    notes: note,
    lineItems: lessonInvoiceLines(
      lessons,
      (lesson) =>
        resolvePrivatePayLessonRateCents(lesson, student, rateByLength),
      newInvoiceLineId,
    ),
  };
}

/** What a standing-schedule dialog submits. */
export interface StandingScheduleSubmit {
  teacherId: string;
  blockId: string;
  dayOfWeek: number;
  startMinutes: number;
  durationMinutes: number;
  intervalWeeks: number;
  startsOn: Date;
  /** How to make room when no block covers the time (legacy #835). */
  blockStrategy?: BlockStrategy;
}

/**
 * Opens the schedule-lesson dialog for one student, owning that student's
 * lesson hook. Mounted only while scheduling, so the per-student fetch is lazy.
 */
export function ScheduleLessonLauncher({
  student,
  instructors,
  blocks,
  onClose,
}: {
  student: Student;
  instructors: Instructor[];
  blocks: LessonBlock[];
  onClose: () => void;
}) {
  const { createLesson, createLessonSeries } = useLessons({
    studentId: student.id,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateSingle = async (input: CreateLessonInput) => {
    setIsSubmitting(true);
    try {
      await createLesson(input);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleCreateSeries = async (input: CreateLessonSeriesInput) => {
    setIsSubmitting(true);
    try {
      await createLessonSeries(input);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScheduleLessonDialog
      open
      onClose={onClose}
      studentId={student.id}
      defaultTeacherId={student.primaryTeacherId}
      instructors={instructors}
      blocks={blocks}
      defaultDurationMinutes={defaultDurationFor(student)}
      onCreateSingle={handleCreateSingle}
      onCreateSeries={handleCreateSeries}
      isSubmitting={isSubmitting}
    />
  );
}

/** Opens the create-invoice dialog for one student, owning its invoice hook. */
export function InvoiceLauncher({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const { invoicesState, createInvoice, updateInvoice } = useInvoices({
    studentId: student.id,
  });
  const { lessonsState } = useLessons({ studentId: student.id });
  // The picker needs to know what already bills each lesson, or it offers a
  // second ask for teaching a card charge already paid for (#110).
  const { billingState } = useLessonBilling(student.id);
  const lessons = lessonsState.status === 'success' ? lessonsState.data : [];
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (input: CreateInvoiceInput) => {
    setIsSubmitting(true);
    try {
      await createInvoice(input);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleUpdate = async (input: UpdateInvoiceInput) => {
    setIsSubmitting(true);
    try {
      await updateInvoice(input);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <InvoiceBuilderDialog
      open
      onClose={onClose}
      studentId={student.id}
      lessons={lessons}
      charges={
        billingState.status === 'success' ? billingState.data.charges : []
      }
      invoices={invoicesState.status === 'success' ? invoicesState.data : []}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      isSubmitting={isSubmitting}
    />
  );
}

/**
 * Sets or changes a student's weekly slot from the table.
 *
 * The dialog waits for the student's arrangements to load before it opens:
 * opening "new" before knowing one exists is how a second, duplicate slot gets
 * made. One active arrangement opens for editing; none opens a new one. More
 * than one is unusual enough that the student page, which lists them all, is
 * the right place to choose.
 */
export function StandingScheduleLauncher({
  student,
  instructors,
  blocks,
  onClose,
  onSaved,
}: {
  student: Student;
  instructors: Instructor[];
  blocks: LessonBlock[];
  onClose: () => void;
  /** A saved arrangement materialises lessons, which the table shows. */
  onSaved?: () => void;
}) {
  const { schedulesState, createSchedule, updateSchedule, pendingId } =
    useStudentLessonSchedules(student.id);
  const [error, setError] = useState<string | null>(null);

  if (schedulesState.status === 'idle' || schedulesState.status === 'loading') {
    return (
      <Dialog open onClose={onClose}>
        <DialogContent
          aria-busy="true"
          aria-label="Loading the weekly schedule"
          sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <CircularProgress size={20} />
          Loading the weekly schedule…
        </DialogContent>
      </Dialog>
    );
  }

  const active =
    schedulesState.status === 'success'
      ? schedulesState.data.filter((s) => s.status === 'active')
      : [];

  if (schedulesState.status === 'error' || active.length > 1) {
    return (
      <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Weekly schedule</DialogTitle>
        <DialogContent>
          {schedulesState.status === 'error' ? (
            <Alert severity="error">
              Could not load the weekly schedule: {schedulesState.error}
            </Alert>
          ) : (
            <Alert severity="info">
              {student.name} has {active.length} weekly slots. Choose which one
              to change on their page.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="contained"
            component={Link}
            href={`/students/${student.id}`}
          >
            Open student
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  const existing = active[0];

  const handleSubmit = async (input: StandingScheduleSubmit) => {
    setError(null);
    try {
      if (existing) {
        await updateSchedule({ id: existing.id, ...input });
      } else {
        await createSchedule({ ...input, studentId: student.id });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save the schedule',
      );
    }
  };

  return (
    <StandingScheduleDialog
      open
      schedule={existing}
      instructors={instructors}
      blocks={blocks}
      defaultTeacherId={student.primaryTeacherId}
      isSubmitting={pendingId !== null}
      error={error}
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
}

const BILLING_TITLES: Record<Exclude<CommitLessonsScope, 'all'>, string> = {
  owed: 'Charge for past lessons',
  upcoming: 'Next lessons',
};

/**
 * Charges for past lessons, or lines up and prepays the next ones, from the
 * table. The same card the student page shows, inside a dialog.
 *
 * Moving or skipping a date needs the lesson editor, which lives on the student
 * page; the dialog links there rather than growing a second editor.
 */
export function LessonBillingLauncher({
  student,
  scope,
  onClose,
  onBilled,
}: {
  student: Student;
  scope: Exclude<CommitLessonsScope, 'all'>;
  onClose: () => void;
  /** Money was asked for, so studio-wide billing views are stale. */
  onBilled?: () => void;
}) {
  const { lessonsState, fetchLessons } = useLessons({ studentId: student.id });
  const { billingState, pendingId, actionError, chargeNow } = useLessonBilling(
    student.id,
  );
  const { invoicesState, createInvoice } = useInvoices({
    studentId: student.id,
  });
  const [isInvoicing, setIsInvoicing] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Close shortly after a success so the confirmation is seen, not skipped.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(onClose, 1500);
    return () => clearTimeout(timer);
  }, [done, onClose]);

  const isLoading =
    lessonsState.status !== 'success' ||
    billingState.status !== 'success' ||
    invoicesState.status !== 'success';

  const loadError =
    (lessonsState.status === 'error' && lessonsState.error) ||
    (billingState.status === 'error' && billingState.error) ||
    (invoicesState.status === 'error' && invoicesState.error) ||
    null;

  const lessons: Lesson[] =
    lessonsState.status === 'success' ? lessonsState.data : [];
  const rateByLength =
    billingState.status === 'success' ? billingState.data.rateByLength : {};

  let body: ReactNode;
  if (student.isHopeScholarship) {
    body = (
      <Alert severity="info">
        Hope Scholarship students are billed through the EMA portal, so nothing
        is charged here.
      </Alert>
    );
  } else if (done) {
    body = <Alert severity="success">{done}</Alert>;
  } else if (loadError) {
    body = <Alert severity="error">Could not load lessons: {loadError}</Alert>;
  } else {
    body = (
      <Box sx={{ pt: 1 }}>
        <CommitLessonsCard
          embedded
          scope={scope}
          // Setting up lessons needs the weekly-time and lesson dialogs, which
          // live on the student page; send Katie there rather than duplicate them.
          emptyActions={
            <Button
              variant="contained"
              component={Link}
              href={`/students/${student.id}`}
            >
              Set up lessons on their page
            </Button>
          }
          student={student}
          isLoading={isLoading}
          lessons={lessons}
          charges={
            billingState.status === 'success' ? billingState.data.charges : []
          }
          invoices={
            invoicesState.status === 'success' ? invoicesState.data : []
          }
          rateByLength={rateByLength}
          isCharging={pendingId !== null}
          isInvoicing={isInvoicing}
          error={actionError}
          onCharge={async ({ lessonIds, amountCents, note }) => {
            const failure = await chargeNow({
              studentId: student.id,
              lessonIds,
              amountCents,
              note,
            });
            if (!failure) {
              await fetchLessons();
              onBilled?.();
              setDone('Charged. The card has been billed.');
            }
          }}
          onSendInvoice={async (input) => {
            if (input.lessons.length === 0) return;
            setIsInvoicing(true);
            try {
              await createInvoice(
                blockInvoiceInput(student, input, rateByLength),
              );
              onBilled?.();
              setDone('Invoice sent.');
            } finally {
              setIsInvoicing(false);
            }
          }}
        />
      </Box>
    );
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {BILLING_TITLES[scope]} · {student.name}
      </DialogTitle>
      <DialogContent>{body}</DialogContent>
      <DialogActions>
        <Button component={Link} href={`/students/${student.id}`}>
          {scope === 'upcoming'
            ? 'Move or skip dates on their page'
            : 'Open student'}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
