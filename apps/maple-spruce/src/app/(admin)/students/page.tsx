'use client';

import { useState, useCallback } from 'react';
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
  Student,
} from '@maple/ts/domain';
import { SCHEDULE_TIME_ZONE, studentDraftFromInquiry } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  InquirySuggestions,
  StudentForm,
  StudentsByDay,
} from '@maple/react/students';
import { NeedsAttentionPanel } from '@maple/react/lessons';
import { useRoles } from '@maple/react/auth';
import {
  useAllStudentLessonSchedules,
  useInstructors,
  useLessonInquiries,
  useHopeProducts,
  useLessonBilling,
  useNeedsAttention,
  useStudents,
} from '../../../hooks';

/** Today's weekday in the studio, so today's section can be marked. */
function studioWeekday(now: Date): number {
  const short = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: SCHEDULE_TIME_ZONE,
  }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

export default function StudentsPage() {
  const {
    studentsState,
    createStudent,
    updateStudent,
    deleteStudent: deleteStudentApi,
  } = useStudents();
  const { attentionState } = useNeedsAttention();
  const { instructorsState } = useInstructors();
  // Each student's day comes from their weekly time (#159), not from booked
  // lessons: lessons are booked a few at a time, so between bookings a
  // student has none.
  const { schedulesState } = useAllStudentLessonSchedules();
  // Inquiries power the "Start from an inquiry" suggestions (legacy #819). Same seam
  // as /leads → "Create student…", offered from whichever page you are on.
  const { inquiriesState, updateStatus } = useLessonInquiries();

  // The rules list, so the form can put a student on one (#107).
  const { billingState: studioBillingState } = useLessonBilling();
  const billingRules =
    studioBillingState.status === 'success' ? studioBillingState.data.rules : [];
  // EMA products, so the form can put a Hope student on the one they bill under.
  const { productsState: hopeProductsState } = useHopeProducts();
  const hopeProducts =
    hopeProductsState.status === 'success' ? hopeProductsState.data : [];

  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  // A teacher sees their own students first; other teachers' are one click
  // away. Only an admin can see other teachers' students at all, and a login
  // that teaches nobody has no "mine" to start from.
  const { instructorId, isAdmin } = useRoles();
  const [showEveryone, setShowEveryone] = useState(false);
  const canChoose = Boolean(instructorId) && isAdmin;
  const onlyTeacher = instructorId && !showEveryone ? instructorId : undefined;

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

      {canChoose && (
        <Box sx={{ mb: 2 }}>
          <ToggleButtonGroup
            exclusive
            value={showEveryone ? 'everyone' : 'mine'}
            onChange={(_, next) => {
              if (next) setShowEveryone(next === 'everyone');
            }}
            size="small"
            aria-label="Whose students to show"
          >
            <ToggleButton value="mine">My students</ToggleButton>
            <ToggleButton value="everyone">Everyone’s</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <StudentsByDay
        studentsState={studentsState}
        schedulesState={schedulesState}
        instructors={instructors}
        teacherId={onlyTeacher}
        showTeacher={!onlyTeacher}
        todayWeekday={studioWeekday(new Date())}
        hrefFor={(student) => `/students/${student.id}`}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
      />

      <StudentForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        student={editingStudent}
        instructors={instructors}
        billingRules={billingRules}
        hopeProducts={hopeProducts}
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
