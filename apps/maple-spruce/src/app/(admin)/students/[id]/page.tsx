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
import type {
  CreateInvoiceInput,
  CreateLessonInput,
  CreateLessonSeriesInput,
  Invoice,
  Lesson,
  UpdateInvoiceInput,
  UpdateLessonInput,
} from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  EditLessonDialog,
  HopeScholarshipBanner,
  LessonList,
  ScheduleLessonDialog,
} from '@maple/react/lessons';
import {
  InvoiceBuilderDialog,
  InvoiceList,
} from '@maple/react/invoices';
import {
  INSTRUMENT_LABELS,
  LESSON_LENGTH_LABELS,
} from '@maple/react/students';
import {
  useInstructors,
  useInvoices,
  useLessons,
  useStudents,
} from '../../../../hooks';

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params?.id ?? '';

  const { studentsState } = useStudents();
  const { instructorsState } = useInstructors();
  const {
    lessonsState,
    createLesson,
    createLessonSeries,
    updateLesson,
  } = useLessons({ studentId });
  const {
    invoicesState,
    createInvoice,
    updateInvoice,
    deleteInvoice,
  } = useInvoices({ studentId });

  const student = useMemo(() => {
    if (studentsState.status !== 'success') return undefined;
    return studentsState.data.find((s) => s.id === studentId);
  }, [studentsState, studentId]);

  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  const primaryTeacherName = useMemo(() => {
    if (!student) return '—';
    const match = instructors.find((i) => i.id === student.primaryTeacherId);
    return match?.name ?? 'Unassigned';
  }, [student, instructors]);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<Lesson | undefined>();
  const [cancelLesson, setCancelLesson] = useState<Lesson | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invoice state
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>();
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(
    null
  );
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);

  const lessons = useMemo(
    () =>
      lessonsState.status === 'success' ? lessonsState.data : [],
    [lessonsState]
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
    setIsSubmitting(true);
    try {
      await updateLesson({ id: cancelLesson.id, status: 'cancelled' });
      setCancelLesson(null);
    } finally {
      setIsSubmitting(false);
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

  const handleInvoiceMarkPaid = async (invoice: Invoice) => {
    setIsSubmitting(true);
    try {
      await updateInvoice({ id: invoice.id, status: 'paid' });
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

  const handleMarkRendered = async (lesson: Lesson) => {
    setIsSubmitting(true);
    try {
      await updateLesson({ id: lesson.id, status: 'rendered' });
    } finally {
      setIsSubmitting(false);
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
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5 }}
          >
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

      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Lessons
      </Typography>
      <LessonList
        lessonsState={lessonsState}
        instructors={instructors}
        primaryTeacherId={student.primaryTeacherId}
        onEdit={(lesson) => setEditLesson(lesson)}
        onCancel={(lesson) => setCancelLesson(lesson)}
        onMarkRendered={handleMarkRendered}
      />

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: 4,
          mb: 2,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h6" component="h2">
          Invoices
        </Typography>
        {student.isHopeScholarship ? (
          <Button
            variant="outlined"
            disabled
            startIcon={<AddIcon />}
            title="Hope Scholarship students are invoiced via the EMA portal"
          >
            New invoice (disabled for Hope)
          </Button>
        ) : (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingInvoice(undefined);
              setInvoiceDialogOpen(true);
            }}
          >
            New invoice
          </Button>
        )}
      </Box>

      {!student.isHopeScholarship && (
        <InvoiceList
          invoicesState={invoicesState}
          onEdit={handleInvoiceEdit}
          onSend={handleInvoiceSend}
          onMarkPaid={handleInvoiceMarkPaid}
          onVoid={(invoice) => setInvoiceToVoid(invoice)}
          onDelete={(invoice) => setInvoiceToDelete(invoice)}
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

      <ScheduleLessonDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        studentId={student.id}
        defaultTeacherId={student.primaryTeacherId}
        instructors={instructors}
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
            Voiding preserves the invoice for history but marks it as
            cancelled. Use this for refunds or mistakes once an invoice has
            been sent — drafts can be deleted outright.
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
            Drafts can be hard-deleted. Sent or paid invoices must be
            voided instead to preserve history.
          </Alert>
        }
      />
    </>
  );
}
