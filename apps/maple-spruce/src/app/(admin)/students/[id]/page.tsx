'use client';

/**
 * A student, in three tabs (#158).
 *
 *  - **Next lessons** (the default): what Katie does in the five minutes at
 *    the end of a lesson — book the next four and take payment, one button.
 *  - **Settings**: the weekly time, the next few lessons to move or delete,
 *    and the card on file.
 *  - **Activity**: the record of lessons and billing, rarely opened. The only
 *    place a past lesson can be charged for, and it never calls an unpaid
 *    past lesson out as a problem: past payments were settled outside the
 *    portal.
 *
 * Nothing here marks lessons taught or missed. A lesson is scheduled or
 * deleted, paid or not (#157).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Skeleton,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import {
  CHARGE_LESSON_PARAM,
  SCHEDULE_TIME_ZONE,
  invoicedLessonIds,
  lessonBillingState,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';
import type {
  CreateInvoiceInput,
  CreateLessonInput,
  CreateLessonSeriesInput,
  CreateStudentInput,
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
  HopeStudentBilling,
  LessonActivity,
  NextLessonsPanel,
  PaymentMethodCard,
  ScheduleLessonDialog,
  StandingScheduleCard,
  StandingScheduleDialog,
  UpcomingLessonsCard,
  buildNextLessons,
  describeCard,
  describeSchedule,
  isLessonPaid,
  paidThrough,
  type LessonActivityLabel,
  type NextLessonItem,
  type NextLessonsView,
} from '@maple/react/lessons';
import { BillingTable, InvoiceBuilderDialog } from '@maple/react/invoices';
import { INSTRUMENT_LABELS, StudentForm } from '@maple/react/students';
import {
  useHopeProducts,
  useHopeQueue,
  useInstructors,
  useInvoices,
  useLessonBilling,
  useLessonBlocks,
  useLessons,
  useSquareCardCandidates,
  useStudentLessonSchedules,
  useStudents,
} from '../../../../hooks';
import {
  blockInvoiceInput,
  defaultDurationFor,
  type StandingScheduleSubmit,
} from '../student-launchers';
import { bookAndPay, type PayMethod } from './book-and-pay';

export const STUDENT_TABS = ['next', 'settings', 'activity'] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "Mon, Oct 5" in the studio's timezone, so it matches the lesson lists. */
function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params?.id ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  // A needs-attention row links to a past lesson (#128): it lives on Activity.
  const chargeLessonId = searchParams?.get(CHARGE_LESSON_PARAM) ?? null;
  const tabParam = searchParams?.get('tab');
  const tab: StudentTab = STUDENT_TABS.includes(tabParam as StudentTab)
    ? (tabParam as StudentTab)
    : chargeLessonId
      ? 'activity'
      : 'next';
  const setTab = (next: StudentTab) =>
    router.replace(`/students/${studentId}?tab=${next}`, { scroll: false });

  const { studentsState, fetchStudents, updateStudent } = useStudents();
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
    deleteLesson,
  } = useLessons({ studentId });
  const {
    invoicesState,
    fetchInvoices,
    createInvoice,
    updateInvoice,
    recordPayment,
    deleteInvoice,
  } = useInvoices({ studentId });
  const { lessonBlocksState } = useLessonBlocks();
  const { productsState: hopeProductsState } = useHopeProducts();
  const {
    queueState: hopeQueueState,
    fetchQueue: fetchHopeQueue,
    recordSubmissions: recordHopeSubmissions,
    recording: hopeRecording,
    saveOrder: saveHopeOrder,
    isSavingOrder: isSavingHopeOrder,
  } = useHopeQueue({ studentId, autoFetch: false });
  const {
    schedulesState,
    createSchedule,
    updateSchedule,
    pendingId: schedulePendingId,
  } = useStudentLessonSchedules(studentId);

  const student = useMemo(() => {
    if (studentsState.status !== 'success') return undefined;
    return studentsState.data.find((s) => s.id === studentId);
  }, [studentsState, studentId]);
  const isHope = Boolean(student?.isHopeScholarship);
  useEffect(() => {
    if (isHope) fetchHopeQueue();
  }, [isHope, fetchHopeQueue]);

  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];
  const blocks =
    lessonBlocksState.status === 'success' ? lessonBlocksState.data : [];
  const hopeProducts =
    hopeProductsState.status === 'success' ? hopeProductsState.data : [];
  const lessons = useMemo(
    () => (lessonsState.status === 'success' ? lessonsState.data : []),
    [lessonsState]
  );
  const charges = useMemo(
    () => (billingState.status === 'success' ? billingState.data.charges : []),
    [billingState]
  );
  const invoices = useMemo(
    () => (invoicesState.status === 'success' ? invoicesState.data : []),
    [invoicesState]
  );
  const rateByLength =
    billingState.status === 'success' ? billingState.data.rateByLength : {};
  const activeSchedule = useMemo(
    () =>
      schedulesState.status === 'success'
        ? schedulesState.data.find((s) => s.status === 'active')
        : undefined,
    [schedulesState]
  );

  // ---- Next lessons -------------------------------------------------------

  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [moved, setMoved] = useState<ReadonlyMap<string, Date>>(new Map());
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payNotice, setPayNotice] = useState<string | null>(null);

  const nextState = useMemo<RequestState<NextLessonsView>>(() => {
    const sources = [lessonsState, billingState, invoicesState, schedulesState];
    const failed = sources.find((s) => s.status === 'error');
    if (failed && failed.status === 'error') {
      return { status: 'error', error: failed.error };
    }
    if (sources.some((s) => s.status !== 'success')) return { status: 'loading' };
    return {
      status: 'success',
      data: buildNextLessons({
        schedule: activeSchedule,
        lessons,
        charges,
        invoicedIds: invoicedLessonIds(invoices),
        now: new Date(),
        skipped,
        moved,
      }),
    };
  }, [
    lessonsState,
    billingState,
    invoicesState,
    schedulesState,
    activeSchedule,
    lessons,
    charges,
    invoices,
    skipped,
    moved,
  ]);

  const priceOf = (item: Pick<Lesson, 'durationMinutes'>) =>
    student ? resolvePrivatePayLessonRateCents(item, student, rateByLength) : 0;

  const cardLabel = student?.squareCardId
    ? describeCard(student.cardBrand, student.cardLast4)
    : undefined;

  const handleMoveNext = async (item: NextLessonItem, to: Date) => {
    if (item.lessonId) {
      // Already on the calendar: move the lesson itself.
      setPaying(true);
      setPayError(null);
      try {
        await updateLesson({ id: item.lessonId, scheduledAt: to });
      } catch (err) {
        setPayError(err instanceof Error ? err.message : 'Could not move it');
      } finally {
        setPaying(false);
      }
      return;
    }
    setMoved((prev) => new Map(prev).set(item.key, to));
  };

  const handlePay = async (method: PayMethod) => {
    if (!student || nextState.status !== 'success') return;
    setPaying(true);
    setPayError(null);
    try {
      const result = await bookAndPay(
        {
          createLessonSeries,
          chargeNow: (input) => chargeNow(input),
          createInvoice,
        },
        {
          student,
          schedule: activeSchedule,
          items: nextState.data.items,
          blocks,
          instructors,
          rateByLength,
          method,
        }
      );
      // Whatever happened, the lessons and billing on screen must match it.
      await Promise.all([fetchLessons(), fetchInvoices()]);
      if (result.ok) {
        setPayNotice(result.notice);
        setSkipped(new Set());
        setMoved(new Map());
      } else {
        setPayError(result.error);
      }
    } finally {
      setPaying(false);
    }
  };

  // ---- Settings -----------------------------------------------------------

  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<
    StudentLessonSchedule | undefined
  >();
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [addLessonOpen, setAddLessonOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<Lesson | undefined>();
  const [deletingLesson, setDeletingLesson] = useState<Lesson | null>(null);
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const upcomingState = useMemo<RequestState<Lesson[]>>(() => {
    if (lessonsState.status !== 'success') return lessonsState;
    const now = Date.now();
    return {
      status: 'success',
      data: lessonsState.data
        .filter((l) => l.status !== 'cancelled' && l.scheduledAt.getTime() >= now)
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()),
    };
  }, [lessonsState]);

  const paidLessonIds = useMemo(
    () =>
      new Set(
        lessons
          .filter((l) => isLessonPaid(l.id, charges, invoices))
          .map((l) => l.id)
      ),
    [lessons, charges, invoices]
  );

  const openScheduleDialog = (schedule?: StudentLessonSchedule) => {
    setEditingSchedule(schedule);
    setScheduleError(null);
    setScheduleDialogOpen(true);
  };

  const handleScheduleSubmit = async (input: StandingScheduleSubmit) => {
    setScheduleError(null);
    try {
      if (editingSchedule) {
        await updateSchedule({ id: editingSchedule.id, ...input });
      } else {
        await createSchedule({ ...input, studentId });
      }
      setScheduleDialogOpen(false);
      setEditingSchedule(undefined);
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : 'Could not save the weekly time'
      );
    }
  };

  const handleEndSchedule = async (schedule: StudentLessonSchedule) => {
    await updateSchedule({ id: schedule.id, status: 'ended', endsOn: new Date() });
  };

  const handleDeleteLesson = async () => {
    if (!deletingLesson) return;
    setPendingLessonId(deletingLesson.id);
    setIsSubmitting(true);
    try {
      await deleteLesson(deletingLesson.id);
      setDeletingLesson(null);
    } finally {
      setIsSubmitting(false);
      setPendingLessonId(null);
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

  const handleSaveStudent = async (data: CreateStudentInput) => {
    setIsSavingStudent(true);
    try {
      await updateStudent({ id: studentId, ...data });
      setEditStudentOpen(false);
    } finally {
      setIsSavingStudent(false);
    }
  };

  // ---- Activity -----------------------------------------------------------

  const [settling, setSettling] = useState<{
    lesson: Lesson;
    method: 'card' | 'invoice';
  } | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>();
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);

  const chargesState = useMemo<RequestState<LessonScheduledCharge[]>>(
    () =>
      billingState.status === 'success'
        ? { status: 'success', data: billingState.data.charges }
        : billingState,
    [billingState]
  );

  const activityLabel = (lesson: Lesson): LessonActivityLabel => {
    if (lesson.status === 'cancelled') return 'cancelled';
    const state = lessonBillingState(lesson.id, charges, invoices);
    if (isLessonPaid(lesson.id, charges, invoices)) return 'paid';
    if (state.kind === 'invoiced' && state.status !== 'void') return 'invoiced';
    return 'none';
  };

  const handleSettle = async () => {
    if (!settling || !student) return;
    const { lesson, method } = settling;
    const amountCents = priceOf(lesson);
    setIsSubmitting(true);
    setSettleError(null);
    try {
      if (method === 'card') {
        const failure = await chargeNow({
          studentId,
          lessonIds: [lesson.id],
          amountCents,
        });
        if (failure) {
          setSettleError(failure);
          return;
        }
      } else {
        await createInvoice(
          blockInvoiceInput(student, { lessons: [lesson], amountCents }, rateByLength)
        );
        await fetchInvoices();
      }
      setSettling(null);
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : 'Could not do that');
    } finally {
      setIsSubmitting(false);
    }
  };

  const runInvoiceAction = async (action: () => Promise<unknown>) => {
    setIsSubmitting(true);
    try {
      await action();
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Render -------------------------------------------------------------

  if (studentsState.status === 'idle' || studentsState.status === 'loading') {
    return (
      <Box aria-busy="true">
        <Skeleton variant="text" width={240} height={40} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={320} sx={{ mb: 3 }} />
        <Skeleton variant="rectangular" height={240} />
      </Box>
    );
  }
  if (studentsState.status === 'error') {
    return (
      <Alert severity="error">
        Could not load the student: {studentsState.error}
      </Alert>
    );
  }
  if (!student) {
    return (
      <>
        <Alert severity="error">Student not found.</Alert>
        <Button component={Link} href="/students" sx={{ mt: 2 }}>
          Back to students
        </Button>
      </>
    );
  }

  // The one line that orients: what they play, when, and how far they are paid.
  const paidUntil = paidThrough(lessons, charges, invoices, new Date());
  const orientation = [
    INSTRUMENT_LABELS[student.instrument] ?? student.instrument,
    activeSchedule ? describeSchedule(activeSchedule) : 'No weekly time',
    isHope
      ? 'Hope Scholarship'
      : paidUntil
        ? `Paid through ${formatDay(paidUntil)}`
        : null,
  ]
    .filter(Boolean)
    .join(' · ');

  let voidMessage: string | undefined;
  if (invoiceToVoid) {
    const lines = invoiceToVoid.lineItems.length;
    voidMessage = `Void the invoice for ${lines} line${
      lines === 1 ? '' : 's'
    }? It stays on the record, marked cancelled.`;
  }

  return (
    <>
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link href="/students" style={{ color: 'inherit' }}>
          Students
        </Link>
        <Typography color="textPrimary">{student.name}</Typography>
      </Breadcrumbs>
      <Typography variant="h4" component="h1">
        {student.name}
      </Typography>
      <Typography color="textSecondary" sx={{ mb: 2 }}>
        {orientation}
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, next: StudentTab) => setTab(next)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="next" label="Next lessons" />
        <Tab value="settings" label="Settings" />
        <Tab value="activity" label="Activity" />
      </Tabs>

      {tab === 'next' && (
        <NextLessonsPanel
          viewState={nextState}
          priceOf={priceOf}
          isHope={isHope}
          cardLabel={cardLabel}
          busy={paying}
          error={payError}
          notice={payNotice}
          onSkip={(item) => setSkipped((prev) => new Set(prev).add(item.key))}
          onMove={handleMoveNext}
          onCharge={() => handlePay('card')}
          onInvoice={() => handlePay('invoice')}
          onBook={() => handlePay('none')}
          onSetWeeklyTime={() => {
            setTab('settings');
            openScheduleDialog();
          }}
          onBookMore={() => setPayNotice(null)}
        />
      )}

      {tab === 'settings' && (
        <>
          {isHope && (
            <HopeScholarshipBanner
              hopeProductId={student.hopeProductId}
              products={hopeProducts}
              registeredLessonLength={student.registeredLessonLength}
              onChooseProduct={() => setEditStudentOpen(true)}
            />
          )}
          <StandingScheduleCard
            schedulesState={schedulesState}
            instructors={instructors}
            pendingId={schedulePendingId}
            onAdd={() => openScheduleDialog()}
            onEdit={(schedule) => openScheduleDialog(schedule)}
            onEnd={handleEndSchedule}
          />
          <UpcomingLessonsCard
            lessonsState={upcomingState}
            paidLessonIds={paidLessonIds}
            pendingLessonId={pendingLessonId}
            onMove={(lesson) => setEditLesson(lesson)}
            onDelete={(lesson) => setDeletingLesson(lesson)}
          />
          <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setAddLessonOpen(true)}
              disabled={instructors.length === 0}
            >
              Add a lesson
            </Button>
            <Button
              startIcon={<EditIcon />}
              onClick={() => setEditStudentOpen(true)}
              disabled={instructors.length === 0}
            >
              Edit student details
            </Button>
          </Box>
          {!isHope && (
            <PaymentMethodCard
              student={student}
              cards={cardsState.status === 'success' ? cardsState.data.cards : []}
              linkedTo={
                cardsState.status === 'success' ? cardsState.data.linkedTo : {}
              }
              isLoading={cardsState.status === 'loading'}
              isSaving={isCardSaving}
              error={
                linkError ?? (cardsState.status === 'error' ? cardsState.error : null)
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
          )}
        </>
      )}

      {tab === 'activity' && (
        <>
          {isHope && (
            <Box sx={{ mb: 3 }}>
              {(hopeQueueState.status === 'idle' ||
                hopeQueueState.status === 'loading') && (
                <Skeleton
                  variant="rectangular"
                  height={140}
                  aria-label="Loading Hope billing"
                />
              )}
              {hopeQueueState.status === 'error' && (
                <Alert severity="error">
                  Could not load Hope billing: {hopeQueueState.error}
                </Alert>
              )}
              {hopeQueueState.status === 'success' && (
                <HopeStudentBilling
                  studentName="Hope billing"
                  entries={hopeQueueState.data.entries}
                  orders={hopeQueueState.data.orders}
                  products={hopeProducts}
                  defaultProductId={student.hopeProductId}
                  recording={hopeRecording}
                  isSavingOrder={isSavingHopeOrder}
                  onSaveOrder={(input) => saveHopeOrder({ ...input, studentId })}
                  onMarkInvoiced={async (lessonIds, emaReference) => {
                    const result = await recordHopeSubmissions(
                      lessonIds,
                      'submitted',
                      { emaReference }
                    );
                    if (result.skipped.length > 0) {
                      throw new Error(
                        result.skipped.map((s) => s.reason).join('; ')
                      );
                    }
                  }}
                />
              )}
            </Box>
          )}
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            Lessons
          </Typography>
          <LessonActivity
            lessonsState={lessonsState}
            labelOf={activityLabel}
            isHope={isHope}
            hasCard={Boolean(cardLabel)}
            highlightLessonId={chargeLessonId}
            busy={isSubmitting || chargePendingId !== null}
            onCharge={(lesson) => {
              setSettleError(null);
              setSettling({ lesson, method: 'card' });
            }}
            onInvoice={(lesson) => {
              setSettleError(null);
              setSettling({ lesson, method: 'invoice' });
            }}
          />
          {!isHope && (
            <>
              <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 1 }}>
                Billing
              </Typography>
              <BillingTable
                invoicesState={invoicesState}
                chargesState={chargesState}
                lessons={lessons}
                onNewInvoice={() => {
                  setEditingInvoice(undefined);
                  setInvoiceDialogOpen(true);
                }}
                onEditInvoice={(invoice) => {
                  setEditingInvoice(invoice);
                  setInvoiceDialogOpen(true);
                }}
                onSendInvoice={(invoice) =>
                  runInvoiceAction(() =>
                    updateInvoice({ id: invoice.id, status: 'sent' })
                  )
                }
                onRecordPayment={(invoice, source: ManualInvoicePaymentSource) =>
                  runInvoiceAction(() => recordPayment({ id: invoice.id, source }))
                }
                onVoidInvoice={(invoice) => setInvoiceToVoid(invoice)}
                onDeleteInvoice={(invoice) => setInvoiceToDelete(invoice)}
                chargePendingId={chargePendingId}
                error={chargeError}
                onCancelCharge={(id) => stopCharge(id, 'cancelled')}
                onWaiveCharge={(id, reason) => stopCharge(id, 'waived', reason)}
                onRetryCharge={(id) => chargeNow({ studentId, retryChargeId: id })}
              />
            </>
          )}
        </>
      )}

      {/* ---- Dialogs ---- */}
      <StudentForm
        open={editStudentOpen}
        onClose={() => setEditStudentOpen(false)}
        onSubmit={handleSaveStudent}
        student={student}
        instructors={instructors}
        billingRules={billingState.status === 'success' ? billingState.data.rules : []}
        hopeProducts={hopeProducts}
        isSubmitting={isSavingStudent}
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
        open={addLessonOpen}
        onClose={() => setAddLessonOpen(false)}
        studentId={student.id}
        defaultTeacherId={student.primaryTeacherId}
        instructors={instructors}
        blocks={blocks}
        defaultDurationMinutes={defaultDurationFor(student)}
        onCreateSingle={async (input: CreateLessonInput) => {
          await createLesson(input);
        }}
        onCreateSeries={async (input: CreateLessonSeriesInput) => {
          await createLessonSeries(input);
        }}
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
        open={!!deletingLesson}
        onClose={() => setDeletingLesson(null)}
        onConfirm={handleDeleteLesson}
        isDeleting={isSubmitting}
        title="Delete this lesson?"
        itemName={deletingLesson ? formatDay(deletingLesson.scheduledAt) : ''}
        confirmLabel="Delete the lesson"
        busyLabel="Deleting..."
        dismissLabel="Back"
        warningContent={
          deletingLesson && paidLessonIds.has(deletingLesson.id) ? (
            <Alert severity="warning">
              This lesson was paid for. The payment stays on the record; refund
              it in Square if the family should get the money back.
            </Alert>
          ) : undefined
        }
      />
      <Dialog open={settling !== null} onClose={() => setSettling(null)}>
        <DialogTitle>
          {settling?.method === 'card' ? 'Charge the card?' : 'Send an invoice?'}
        </DialogTitle>
        <DialogContent>
          {settleError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {settleError}
            </Alert>
          )}
          <DialogContentText>
            {settling &&
              (settling.method === 'card'
                ? `Charge ${money(priceOf(settling.lesson))} to ${cardLabel} for the lesson on ${formatDay(settling.lesson.scheduledAt)}.`
                : `Email the family an invoice for ${money(priceOf(settling.lesson))} for the lesson on ${formatDay(settling.lesson.scheduledAt)}.`)}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettling(null)} disabled={isSubmitting}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleSettle}
            disabled={isSubmitting || (settling ? priceOf(settling.lesson) <= 0 : true)}
          >
            {settling?.method === 'card' ? 'Charge' : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>
      <InvoiceBuilderDialog
        open={invoiceDialogOpen}
        onClose={() => {
          setInvoiceDialogOpen(false);
          setEditingInvoice(undefined);
        }}
        studentId={student.id}
        invoice={editingInvoice}
        lessons={lessons}
        charges={charges}
        invoices={invoices}
        onCreate={(input: CreateInvoiceInput) =>
          runInvoiceAction(() => createInvoice(input))
        }
        onUpdate={(input: UpdateInvoiceInput) =>
          runInvoiceAction(() => updateInvoice(input))
        }
        isSubmitting={isSubmitting}
      />
      <DeleteConfirmDialog
        open={!!invoiceToVoid}
        onClose={() => setInvoiceToVoid(null)}
        onConfirm={async () => {
          if (!invoiceToVoid) return;
          await runInvoiceAction(() =>
            updateInvoice({ id: invoiceToVoid.id, status: 'void' })
          );
          setInvoiceToVoid(null);
        }}
        isDeleting={isSubmitting}
        title="Void this invoice?"
        itemName={
          invoiceToVoid
            ? `Invoice for ${invoiceToVoid.lineItems.length} line${
                invoiceToVoid.lineItems.length === 1 ? '' : 's'
              }`
            : ''
        }
        confirmationMessage={voidMessage}
        confirmLabel="Void the invoice"
        busyLabel="Voiding..."
        dismissLabel="Back"
      />
      <DeleteConfirmDialog
        open={!!invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        onConfirm={async () => {
          if (!invoiceToDelete) return;
          await runInvoiceAction(() => deleteInvoice(invoiceToDelete.id));
          setInvoiceToDelete(null);
        }}
        isDeleting={isSubmitting}
        title="Delete this draft invoice?"
        itemName={
          invoiceToDelete
            ? `Draft invoice with ${invoiceToDelete.lineItems.length} line${
                invoiceToDelete.lineItems.length === 1 ? '' : 's'
              }`
            : ''
        }
      />
    </>
  );
}
