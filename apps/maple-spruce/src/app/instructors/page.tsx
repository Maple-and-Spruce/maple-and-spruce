'use client';

import { useState, useCallback } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Instructor, CreateInstructorInput } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { InstructorList, InstructorForm } from '@maple/react/instructors';
import { AppShell } from '../../components/layout';
import { useInstructors } from '../../hooks';

export default function InstructorsPage() {
  // Instructor state from hook (fetches on mount)
  const {
    instructorsState,
    createInstructor,
    updateInstructor,
    deleteInstructor: deleteInstructorApi,
  } = useInstructors();

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<
    Instructor | undefined
  >();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [instructorToDelete, setInstructorToDelete] =
    useState<Instructor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenForm = useCallback((instructor?: Instructor) => {
    setEditingInstructor(instructor);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingInstructor(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateInstructorInput) => {
      setIsSubmitting(true);

      try {
        if (editingInstructor) {
          await updateInstructor({ id: editingInstructor.id, ...data });
        } else {
          await createInstructor(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save instructor:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingInstructor, handleCloseForm, createInstructor, updateInstructor]
  );

  const handleOpenDelete = useCallback((instructor: Instructor) => {
    setInstructorToDelete(instructor);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setInstructorToDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!instructorToDelete) return;

    setIsDeleting(true);

    try {
      await deleteInstructorApi(instructorToDelete.id);
      handleCloseDelete();
    } catch (error) {
      console.error('Failed to delete instructor:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [instructorToDelete, handleCloseDelete, deleteInstructorApi]);

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
          Instructors
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
        >
          Add Instructor
        </Button>
      </Box>

      <InstructorList
        instructorsState={instructorsState}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
      />

      <InstructorForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        instructor={editingInstructor}
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmDialog
        open={!!instructorToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Delete Instructor?"
        itemName={instructorToDelete?.name ?? ''}
        warningContent={
          <Alert severity="warning">
            Consider setting the instructor to "inactive" instead to preserve
            class history. Deleting cannot be undone.
          </Alert>
        }
      />
    </AppShell>
  );
}
