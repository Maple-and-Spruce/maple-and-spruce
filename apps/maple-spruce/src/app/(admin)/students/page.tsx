'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type {
  CreateInvoiceInput,
  LessonInquiry,
  CreateLessonInput,
  CreateLessonSeriesInput,
  CreateStudentInput,
  Instructor,
  LessonBlock,
  RequestState,
  Student,
  UpdateInvoiceInput,
} from '@maple/ts/domain';
import { studentDraftFromInquiry } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  InquirySuggestions,
  StudentForm,
  StudentList,
} from '@maple/react/students';
import { ScheduleLessonDialog } from '@maple/react/lessons';
import { InvoiceBuilderDialog } from '@maple/react/invoices';
import {
  useInstructors,
  useInvoices,
  useLessonBlocks,
  useLessonInquiries,
  useLessons,
  useStudents,
} from '../../../hooks';

/** Duration default from a student's registered lesson length. */
function defaultDurationFor(student: Student): 30 | 45 | 60 {
  if (student.registeredLessonLength === '45-min') return 45;
  if (student.registeredLessonLength === '60-min') return 60;
  return 30;
}

/**
 * Opens the schedule-lesson dialog for one student, owning that student's
 * lesson hook. Mounted only while scheduling, so the per-student fetch is lazy.
 */
function ScheduleLessonLauncher({
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
function InvoiceLauncher({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const { createInvoice, updateInvoice } = useInvoices({
    studentId: student.id,
  });
  const { lessonsState } = useLessons({ studentId: student.id });
  const lessons =
    lessonsState.status === 'success' ? lessonsState.data : [];
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
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      isSubmitting={isSubmitting}
    />
  );
}

type HopeFilter = 'all' | 'hope' | 'private';

export default function StudentsPage() {
  const {
    studentsState,
    createStudent,
    updateStudent,
    deleteStudent: deleteStudentApi,
  } = useStudents();
  const { instructorsState } = useInstructors();
  // All lessons — the table derives each student's recurring day/time slot
  // from their scheduled lessons. The roster is small, so one unscoped fetch
  // is fine.
  const { lessonsState } = useLessons({});
  const { lessonBlocksState } = useLessonBlocks();
  // Inquiries power the "Start from an inquiry" suggestions (#817). Same seam
  // as /leads → "Create student…", offered from whichever page you are on.
  const { inquiriesState, updateStatus } = useLessonInquiries();

  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];
  const lessons =
    lessonsState.status === 'success' ? lessonsState.data : undefined;
  const blocks =
    lessonBlocksState.status === 'success' ? lessonBlocksState.data : [];

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Set when the open form was seeded from an inquiry, so saving links them. */
  const [creatingFromInquiry, setCreatingFromInquiry] =
    useState<LessonInquiry | null>(null);

  // Delete dialog state
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Row-action launchers (schedule / invoice) — one student at a time.
  const [scheduleFor, setScheduleFor] = useState<Student | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<Student | null>(null);

  // Hope Scholarship filter — client-side since roster is small.
  const [hopeFilter, setHopeFilter] = useState<HopeFilter>('all');

  const filteredStudentsState = useMemo<RequestState<Student[]>>(() => {
    if (studentsState.status !== 'success') return studentsState;
    if (hopeFilter === 'all') return studentsState;
    const predicate = (s: Student) =>
      hopeFilter === 'hope' ? s.isHopeScholarship : !s.isHopeScholarship;
    return {
      ...studentsState,
      data: studentsState.data.filter(predicate),
    };
  }, [studentsState, hopeFilter]);

  const handleOpenForm = useCallback((student?: Student) => {
    setEditingStudent(student);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingStudent(undefined);
    setCreatingFromInquiry(null);
  }, []);

  const handleStartFromInquiry = useCallback((inquiry: LessonInquiry) => {
    setEditingStudent(undefined);
    setCreatingFromInquiry(inquiry);
    setIsFormOpen(true);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateStudentInput) => {
      setIsSubmitting(true);

      try {
        if (editingStudent) {
          await updateStudent({ id: editingStudent.id, ...data });
        } else {
          const student = await createStudent(data);
          // Came in from an inquiry, so close its loop too. A failure here is
          // deliberately not fatal: the student exists and the inquiry simply
          // stays open, which is visible and fixable, unlike an inquiry marked
          // enrolled against a student that was never created.
          if (creatingFromInquiry) {
            try {
              await updateStatus(creatingFromInquiry.id, 'enrolled', {
                studentId: student.id,
              });
            } catch (linkError) {
              console.error('Student created but inquiry link failed:', linkError);
            }
          }
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save student:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      editingStudent,
      handleCloseForm,
      createStudent,
      updateStudent,
      creatingFromInquiry,
      updateStatus,
    ]
  );

  const handleOpenDelete = useCallback((student: Student) => {
    setStudentToDelete(student);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setStudentToDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!studentToDelete) return;

    setIsDeleting(true);

    try {
      await deleteStudentApi(studentToDelete.id);
      handleCloseDelete();
    } catch (error) {
      console.error('Failed to delete student:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [studentToDelete, handleCloseDelete, deleteStudentApi]);

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Students
        </Typography>
        <Stack direction="row" spacing={1}>
          <InquirySuggestions
            inquiries={
              inquiriesState.status === 'success' ? inquiriesState.data : []
            }
            students={
              studentsState.status === 'success' ? studentsState.data : []
            }
            onPick={handleStartFromInquiry}
            disabled={instructors.length === 0}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenForm()}
            disabled={instructors.length === 0}
          >
            Add Student
          </Button>
        </Stack>
      </Box>

      {instructors.length === 0 && instructorsState.status === 'success' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Add at least one instructor before creating student records — every
          student needs a primary teacher.
        </Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup
          exclusive
          value={hopeFilter}
          onChange={(_, next) => {
            if (next) setHopeFilter(next as HopeFilter);
          }}
          size="small"
          aria-label="Filter students by Hope Scholarship"
        >
          <ToggleButton value="all">All students</ToggleButton>
          <ToggleButton value="hope">Hope Scholarship only</ToggleButton>
          <ToggleButton value="private">Private-pay only</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <StudentList
        studentsState={filteredStudentsState}
        instructors={instructors}
        lessons={lessons}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
        onScheduleLesson={setScheduleFor}
        onCreateInvoice={setInvoiceFor}
        detailHrefBase="/students"
      />

      {scheduleFor && (
        <ScheduleLessonLauncher
          student={scheduleFor}
          instructors={instructors}
          blocks={blocks}
          onClose={() => setScheduleFor(null)}
        />
      )}

      {invoiceFor && (
        <InvoiceLauncher
          student={invoiceFor}
          onClose={() => setInvoiceFor(null)}
        />
      )}

      <StudentForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        student={editingStudent}
        instructors={instructors}
        isSubmitting={isSubmitting}
        prefill={
          creatingFromInquiry
            ? studentDraftFromInquiry(creatingFromInquiry)
            : undefined
        }
        prefillNote={
          creatingFromInquiry
            ? `Prefilled from ${creatingFromInquiry.contactName}'s inquiry of ` +
              `${creatingFromInquiry.submittedAt.toLocaleDateString()}. Saving ` +
              `also marks that inquiry enrolled.`
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!studentToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Delete Student?"
        itemName={studentToDelete?.name ?? ''}
        warningContent={
          <Alert severity="warning">
            Prefer setting the student to &quot;inactive&quot; to preserve
            lesson and invoice history. Deleting cannot be undone.
          </Alert>
        }
      />
    </>
  );
}
