'use client';

import { useState, useCallback } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { CreateStudentInput, Student } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { StudentForm, StudentList } from '@maple/react/students';
import { AppShell } from '../../components/layout';
import { useInstructors, useStudents } from '../../hooks';

export default function StudentsPage() {
  const {
    studentsState,
    createStudent,
    updateStudent,
    deleteStudent: deleteStudentApi,
  } = useStudents();
  const { instructorsState } = useInstructors();

  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <AppShell>
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

      <StudentList
        studentsState={studentsState}
        instructors={instructors}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
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
    </AppShell>
  );
}
