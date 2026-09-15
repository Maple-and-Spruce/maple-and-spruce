'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Skeleton,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import StarsIcon from '@mui/icons-material/Stars';
import type { BlockStrategy } from '@maple/ts/domain';
import type {
  CreateInvoiceInput,
  CreateLessonInput,
  CreateLessonSeriesInput,
  Invoice,
  Lesson,
  LessonScheduledCharge,
  ManualInvoicePaymentSource,
  RequestState,
  StudentLessonSchedule,
  UpdateInvoiceInput,
  UpdateLessonInput,
} from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  EditLessonDialog,
  HopeScholarshipBanner,
  LessonList,
  ScheduleLessonDialog,
  PaymentMethodCard,
  PrepayLessonsCard,
  StandingScheduleCard,
  StandingScheduleDialog,
  type LessonPendingAction,
} from '@maple/react/lessons';
import { BillingTable, InvoiceBuilderDialog } from '@maple/react/invoices';
import { INSTRUMENT_LABELS, LESSON_LENGTH_LABELS } from '@maple/react/students';
import {
  useInstructors,
  useInvoices,
  useLessons,
  useSquareCardCandidates,
  useLessonBilling,
  useStudentLessonSchedules,
  useLessonBlocks,
  useStudents,
} from '../../../../hooks';

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params?.id ?? '';

  const { studentsState, fetchStudents } = useStudents();
  const { instructorsState } = useInstructors();
  const {
    cardsState,
    isSaving: isCardSaving,
    linkError,
    setStudentCard,
  } = useSquareCardCandidates();
  const {
    billingState,
    pendingId: chargePendingId,
    actionError: chargeError,
    stopCharge,
    chargeNow,
  } = useLessonBilling(studentId);
  const {
    lessonsState,
    fetchLessons,
    createLesson,
    createLessonSeries,
    updateLesson,
  } = useLessons({ studentId });
  const {
    invoicesState,
    createInvoice,
    updateInvoice,
    recordPayment,
    deleteInvoice,
  } = useInvoices({ studentId });
  const { lessonBlocksState } = useLessonBlocks();

  const student = useMemo(() => {
    if (studentsState.status !== 'success') return undefined;
    return studentsState.data.find((s) => s.id === studentId);
  }, [studentsState, studentId]);

  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  const blocks =
    lessonBlocksState.status === 'success' ? lessonBlocksState.data : [];

  const primaryTeacherName = useMemo(() => {
    if (!student) return '—';
    const match = instructors.find((i) => i.id === student.primaryTeacherId);
    return match?.name ?? 'Unassigned';
  }, [student, instructors]);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<Lesson | undefined>();
  const [cancelLesson, setCancelLesson] = useState<Lesson | null>(null);
  /**
   * Which lesson action is in flight. The page already tracked `isSubmitting`
   * but never passed it to `LessonList`, so rows showed no progress at all
   * (#805). Per-lesson so one row saving does not freeze the list.
   */
  const [pendingLessonAction, setPendingLessonAction] =
    useState<LessonPendingAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invoice state
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>();
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);

  const lessons = useMemo(
    () => (lessonsState.status === 'success' ? lessonsState.data : []),
    [lessonsState],
  );

  // The billing table only needs the charges; rules stay with the billing page.
  const chargesState = useMemo<RequestState<LessonScheduledCharge[]>>(
    () =>
      billingState.status === 'success'
        ? { status: 'success', data: billingState.data.charges }
        : billingState,
    [billingState],
  );

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

  const handleEditSubmit = async (input: UpdateLessonInput) => {
    setIsSubmitting(true);
    try {
      await updateLesson(input);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelLesson) return;
    setPendingLessonAction({ lessonId: cancelLesson.id, action: 'cancel' });
    setIsSubmitting(true);
    try {
      await updateLesson({ id: cancelLesson.id, status: 'cancelled' });
      setCancelLesson(null);
    } finally {
      setIsSubmitting(false);
      setPendingLessonAction(null);
    }
  };

  const handleInvoiceCreate = async (input: CreateInvoiceInput) => {
    setIsSubmitting(true);
    try {
      await createInvoice(input);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceUpdate = async (input: UpdateInvoiceInput) => {
    setIsSubmitting(true);
    try {
      await updateInvoice(input);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setInvoiceDialogOpen(true);
  };

  const handleInvoiceSend = async (invoice: Invoice) => {
    setIsSubmitting(true);
    try {
      await updateInvoice({ id: invoice.id, status: 'sent' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceRecordPayment = async (
    invoice: Invoice,
    source: ManualInvoicePaymentSource,
  ) => {
    setIsSubmitting(true);
    try {
      await recordPayment({ id: invoice.id, source });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceVoidConfirm = async () => {
    if (!invoiceToVoid) return;
    setIsSubmitting(true);
    try {
      await updateInvoice({ id: invoiceToVoid.id, status: 'void' });
      setInvoiceToVoid(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceDeleteConfirm = async () => {
    if (!invoiceToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteInvoice(invoiceToDelete.id);
      setInvoiceToDelete(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const {
    schedulesState,
    createSchedule,
    updateSchedule,
    pendingId: schedulePendingId,
  } = useStudentLessonSchedules(studentId);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<
    StudentLessonSchedule | undefined
  >();
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const handleScheduleSubmit = async (input: {
    teacherId: string;
    blockId: string;
    dayOfWeek: number;
    startMinutes: number;
    durationMinutes: number;
    intervalWeeks: number;
    startsOn: Date;
    /** How to make room when no block covers the time (#835). */
    blockStrategy?: BlockStrategy;
  }) => {
    setScheduleError(null);
    try {
      if (editingSchedule) {
        await updateSchedule({ id: editingSchedule.id, ...input });
      } else {
        await createSchedule({ ...input, studentId });
      }
      setScheduleDialogOpen(false);
      setEditingSchedule(undefined);
      // A new arrangement materialises lessons immediately, so show them.
      await fetchLessons();
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : 'Could not save the schedule'
      );
    }
  };

  /** Ending an arrangement stops future lessons; it never deletes past ones. */
  const handleEndSchedule = async (schedule: StudentLessonSchedule) => {
    await updateSchedule({
      id: schedule.id,
      status: 'ended',
      endsOn: new Date(),
    });
  };

  const handleMarkNoShow = async (lesson: Lesson) => {
    setPendingLessonAction({ lessonId: lesson.id, action: 'mark-no-show' });
    setIsSubmitting(true);
    try {
      await updateLesson({ id: lesson.id, status: 'no-show' });
    } finally {
      setIsSubmitting(false);
      setPendingLessonAction(null);
    }
  };

  const handleMarkRendered = async (lesson: Lesson) => {
    // Per-lesson, so the rest of the list stays live while this one saves.
    setPendingLessonAction({ lessonId: lesson.id, action: 'mark-rendered' });
    setIsSubmitting(true);
    try {
      await updateLesson({ id: lesson.id, status: 'rendered' });
    } finally {
      setIsSubmitting(false);
      setPendingLessonAction(null);
    }
  };

  if (studentsState.status === 'loading') {
    return (
      <>
        <Skeleton variant="text" width={240} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ mb: 3 }} />
      </>
    );
  }

  if (studentsState.status === 'success' && !student) {
    return (
      <>
        <Alert severity="error">Student not found.</Alert>
        <Button component={Link} href="/students" sx={{ mt: 2 }}>
          Back to students
        </Button>
      </>
    );
  }

  if (!student) {
    return (
      <>
        <Skeleton variant="rectangular" height={120} />
      </>
    );
  }

  return (
    <>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link href="/students" style={{ color: 'inherit' }}>
          Students
        </Link>
        <Typography color="text.primary">{student.name}</Typography>
      </Breadcrumbs>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            {student.name}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {INSTRUMENT_LABELS[student.instrument]}
            {student.registeredLessonLength &&
              ` · ${LESSON_LENGTH_LABELS[student.registeredLessonLength]}`}
            {` · Teacher: ${primaryTeacherName}`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {student.isAdultStudent ? 'Contact' : 'Parent/guardian'}:{' '}
            {student.primaryContactName} · {student.primaryContactEmail}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              label={student.status}
              size="small"
              color={student.status === 'active' ? 'success' : 'default'}
            />
            {student.isHopeScholarship && (
              <Chip
                icon={<StarsIcon />}
                label="Hope Scholarship"
                size="small"
                color="info"
                variant="outlined"
              />
            )}
            {student.isAdultStudent && (
              <Chip label="Adult" size="small" variant="outlined" />
            )}
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setScheduleOpen(true)}
          disabled={instructors.length === 0}
        >
          Schedule lessons
        </Button>
      </Box>

      {student.isHopeScholarship && (
        <HopeScholarshipBanner
          registeredLessonLength={student.registeredLessonLength}
        />
      )}

      <PaymentMethodCard
        student={student}
        cards={cardsState.status === 'success' ? cardsState.data.cards : []}
        linkedTo={
          cardsState.status === 'success' ? cardsState.data.linkedTo : {}
        }
        isLoading={cardsState.status === 'loading'}
        isSaving={isCardSaving}
        error={
          linkError ??
          (cardsState.status === 'error' ? cardsState.error : null)
        }
        onLink={async (cardId) => {
          const updated = await setStudentCard(studentId, cardId);
          if (updated) await fetchStudents();
        }}
        onUnlink={async () => {
          const updated = await setStudentCard(studentId, null);
          if (updated) await fetchStudents();
        }}
      />

      <PrepayLessonsCard
        student={student}
        lessons={lessons}
        charges={
          billingState.status === 'success' ? billingState.data.charges : []
        }
        rateByLength={
          billingState.status === 'success'
            ? billingState.data.rateByLength
            : {}
        }
        isCharging={chargePendingId !== null}
        error={chargeError}
        onCharge={async ({ lessonIds, amountCents, note }) => {
          const failure = await chargeNow({
            studentId,
            lessonIds,
            amountCents,
            note,
          });
          // A prepaid lesson changes nothing about the lesson rows, but the
          // charge it produced belongs on screen straight away.
          if (!failure) await fetchLessons();
        }}
      />

      <StandingScheduleCard
        schedules={
          schedulesState.status === 'success' ? schedulesState.data : []
        }
        instructors={instructors}
        pendingId={schedulePendingId}
        onAdd={() => {
          setEditingSchedule(undefined);
          setScheduleError(null);
          setScheduleDialogOpen(true);
        }}
        onEdit={(schedule) => {
          setEditingSchedule(schedule);
          setScheduleError(null);
          setScheduleDialogOpen(true);
        }}
        onEnd={handleEndSchedule}
      />

      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Lessons
      </Typography>
      <LessonList
        lessonsState={lessonsState}
        instructors={instructors}
        primaryTeacherId={student.primaryTeacherId}
        blocks={blocks}
        onEdit={(lesson) => setEditLesson(lesson)}
        onCancel={(lesson) => setCancelLesson(lesson)}
        onMarkRendered={handleMarkRendered}
        onMarkNoShow={handleMarkNoShow}
        pendingAction={pendingLessonAction}
      />

      {/*
        Invoices and card charges, automatic and manual, in one table: they are
        the same question ("is this family paid up?") answered three ways.
      */}
      <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>
        Billing
      </Typography>
      {student.isHopeScholarship ? (
        <Typography variant="body2" color="text.secondary">
          Hope Scholarship students are invoiced through the EMA portal, so
          nothing is billed here.
        </Typography>
      ) : (
        <BillingTable
          invoicesState={invoicesState}
          chargesState={chargesState}
          lessons={lessons}
          onNewInvoice={() => {
            setEditingInvoice(undefined);
            setInvoiceDialogOpen(true);
          }}
          onEditInvoice={handleInvoiceEdit}
          onSendInvoice={handleInvoiceSend}
          onRecordPayment={handleInvoiceRecordPayment}
          onVoidInvoice={(invoice) => setInvoiceToVoid(invoice)}
          onDeleteInvoice={(invoice) => setInvoiceToDelete(invoice)}
          chargePendingId={chargePendingId}
          error={chargeError}
          onCancelCharge={(id) => stopCharge(id, 'cancelled')}
          onWaiveCharge={(id, reason) => stopCharge(id, 'waived', reason)}
          onRetryCharge={(id) => chargeNow({ studentId, retryChargeId: id })}
        />
      )}

      <InvoiceBuilderDialog
        open={invoiceDialogOpen}
        onClose={() => {
          setInvoiceDialogOpen(false);
          setEditingInvoice(undefined);
        }}
        studentId={student.id}
        invoice={editingInvoice}
        lessons={lessons}
        onCreate={handleInvoiceCreate}
        onUpdate={handleInvoiceUpdate}
        isSubmitting={isSubmitting}
      />

      <StandingScheduleDialog
        open={scheduleDialogOpen}
        schedule={editingSchedule}
        instructors={instructors}
        blocks={blocks}
        defaultTeacherId={student.primaryTeacherId}
        isSubmitting={schedulePendingId !== null}
        error={scheduleError}
        onClose={() => {
          setScheduleDialogOpen(false);
          setEditingSchedule(undefined);
        }}
        onSubmit={handleScheduleSubmit}
      />

      <ScheduleLessonDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        studentId={student.id}
        defaultTeacherId={student.primaryTeacherId}
        instructors={instructors}
        blocks={blocks}
        defaultDurationMinutes={
          student.registeredLessonLength === '45-min'
            ? 45
            : student.registeredLessonLength === '60-min'
              ? 60
              : 30
        }
        onCreateSingle={handleCreateSingle}
        onCreateSeries={handleCreateSeries}
        isSubmitting={isSubmitting}
      />

      <EditLessonDialog
        open={!!editLesson}
        onClose={() => setEditLesson(undefined)}
        lesson={editLesson}
        primaryTeacherId={student.primaryTeacherId}
        instructors={instructors}
        blocks={blocks}
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmDialog
        open={!!cancelLesson}
        onClose={() => setCancelLesson(null)}
        onConfirm={handleConfirmCancel}
        isDeleting={isSubmitting}
        title="Cancel this lesson?"
        itemName={
          cancelLesson
            ? cancelLesson.scheduledAt.toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : ''
        }
        warningContent={
          <Alert severity="info">
            The lesson stays on record with status &quot;cancelled&quot;. For
            recurring series, other occurrences are unaffected.
          </Alert>
        }
      />

      <DeleteConfirmDialog
        open={!!invoiceToVoid}
        onClose={() => setInvoiceToVoid(null)}
        onConfirm={handleInvoiceVoidConfirm}
        isDeleting={isSubmitting}
        title="Void this invoice?"
        itemName={
          invoiceToVoid
            ? `Invoice for ${invoiceToVoid.lineItems.length} line${
                invoiceToVoid.lineItems.length === 1 ? '' : 's'
              }`
            : ''
        }
        warningContent={
          <Alert severity="warning">
            Voiding preserves the invoice for history but marks it as cancelled.
            Use this for refunds or mistakes once an invoice has been sent —
            drafts can be deleted outright.
          </Alert>
        }
      />

      <DeleteConfirmDialog
        open={!!invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        onConfirm={handleInvoiceDeleteConfirm}
        isDeleting={isSubmitting}
        title="Delete this draft invoice?"
        itemName={
          invoiceToDelete
            ? `Draft invoice with ${invoiceToDelete.lineItems.length} line${
                invoiceToDelete.lineItems.length === 1 ? '' : 's'
              }`
            : ''
        }
        warningContent={
          <Alert severity="warning">
            Drafts can be hard-deleted. Sent or paid invoices must be voided
            instead to preserve history.
          </Alert>
        }
      />
    </>
  );
}
