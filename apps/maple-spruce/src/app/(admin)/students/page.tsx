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
  LessonInquiry,
  CreateStudentInput,
  RequestState,
  Student,
} from '@maple/ts/domain';
import { studentDraftFromInquiry } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  InquirySuggestions,
  StudentForm,
  StudentList,
} from '@maple/react/students';
import { NeedsAttentionPanel } from '@maple/react/lessons';
import {
  useInstructors,
  useLessonBlocks,
  useLessonInquiries,
  useLessonBilling,
  useLessons,
  useNeedsAttention,
  useStudents,
} from '../../../hooks';
import {
  InvoiceLauncher,
  LessonBillingLauncher,
  ScheduleLessonLauncher,
  StandingScheduleLauncher,
} from './student-launchers';

type HopeFilter = 'all' | 'hope' | 'private';

export default function StudentsPage() {
  const {
    studentsState,
    createStudent,
    updateStudent,
    deleteStudent: deleteStudentApi,
  } = useStudents();
  const { attentionState, fetchAttention } = useNeedsAttention();
  const { instructorsState } = useInstructors();
  // All lessons — the table derives each student's recurring day/time slot
  // from their scheduled lessons. The roster is small, so one unscoped fetch
  // is fine.
  const { lessonsState, fetchLessons } = useLessons({});
  const { lessonBlocksState } = useLessonBlocks();
  // Inquiries power the "Start from an inquiry" suggestions (legacy #819). Same seam
  // as /leads → "Create student…", offered from whichever page you are on.
  const { inquiriesState, updateStatus } = useLessonInquiries();

  // The rules list, so the form can put a student on one (#107). The page is
  // already fetching several unscoped lists; this is one more small one.
  const { billingState: studioBillingState } = useLessonBilling();
  const billingRules =
    studioBillingState.status === 'success' ? studioBillingState.data.rules : [];


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

  // Row-action launchers — one student at a time.
  const [scheduleFor, setScheduleFor] = useState<Student | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<Student | null>(null);
  const [weeklyFor, setWeeklyFor] = useState<Student | null>(null);
  const [billingFor, setBillingFor] = useState<{
    student: Student;
    scope: 'owed' | 'upcoming';
  } | null>(null);

  const handleChargePast = useCallback(
    (student: Student) => setBillingFor({ student, scope: 'owed' }),
    []
  );
  const handlePlanNext = useCallback(
    (student: Student) => setBillingFor({ student, scope: 'upcoming' }),
    []
  );

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

      {/* Collapsed to a one-line count; renders nothing when clear (legacy #807). */}
      {attentionState.status === 'success' && (
        <NeedsAttentionPanel
          groups={attentionState.data.groups}
          total={attentionState.data.total}
          scopedToSelf={attentionState.data.scopedToSelf}
          defaultExpanded={false}
        />
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
        onSetWeeklySchedule={setWeeklyFor}
        onChargePastLessons={handleChargePast}
        onPlanNextLessons={handlePlanNext}
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

      {weeklyFor && (
        <StandingScheduleLauncher
          student={weeklyFor}
          instructors={instructors}
          blocks={blocks}
          onClose={() => setWeeklyFor(null)}
          // A new slot materialises lessons, and the Day/Time column reads them.
          onSaved={() => fetchLessons()}
        />
      )}

      {billingFor && (
        <LessonBillingLauncher
          student={billingFor.student}
          scope={billingFor.scope}
          onClose={() => setBillingFor(null)}
          // Settling a lesson clears its "taught, not paid" attention row.
          onBilled={() => fetchAttention()}
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
        billingRules={billingRules}
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
