'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { CreateStudentInput, RequestState, Student } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { StudentForm, StudentList } from '@maple/react/students';
import { useInstructors, useLessons, useStudents } from '../../../hooks';

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

  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];
  const lessons =
    lessonsState.status === 'success' ? lessonsState.data : undefined;

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateStudentInput) => {
      setIsSubmitting(true);

      try {
        if (editingStudent) {
          await updateStudent({ id: editingStudent.id, ...data });
        } else {
          await createStudent(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save student:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingStudent, handleCloseForm, createStudent, updateStudent]
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
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
          disabled={instructors.length === 0}
        >
          Add Student
        </Button>
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
        detailHrefBase="/students"
      />

      <StudentForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        student={editingStudent}
        instructors={instructors}
        isSubmitting={isSubmitting}
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
