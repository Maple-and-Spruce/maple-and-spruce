'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography, Button, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {
  EDIT_INSTRUCTOR_PARAM,
  type Instructor,
  type CreateInstructorInput,
} from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { InstructorList, InstructorForm } from '@maple/react/instructors';
import { useInstructors, useUsers } from '../../../hooks';

export default function InstructorsPage() {
  // useSearchParams needs a Suspense boundary on a statically rendered route.
  return (
    <Suspense>
      <InstructorsPageContent />
    </Suspense>
  );
}

function InstructorsPageContent() {
  // Instructor state from hook (fetches on mount)
  const {
    instructorsState,
    createInstructor,
    updateInstructor,
    deleteInstructor: deleteInstructorApi,
  } = useInstructors();

  // Users power the "Portal login" picker on the form (links a login to an
  // instructor so a lesson teacher can manage their own lessons, #49).
  const { usersState } = useUsers();
  const users = usersState.status === 'success' ? usersState.data : undefined;

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

  // `?edit=<id>` opens that instructor's form — where a Needs Attention row
  // for an instructor who is not cleared to teach lands. The parameter is
  // dropped once used, so closing the dialog does not reopen it.
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get(EDIT_INSTRUCTOR_PARAM);
  useEffect(() => {
    if (!editId || instructorsState.status !== 'success') return;
    const target = instructorsState.data.find((i) => i.id === editId);
    if (target) handleOpenForm(target);
    router.replace('/instructors', { scroll: false });
  }, [editId, instructorsState, handleOpenForm, router]);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingInstructor(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: Omit<CreateInstructorInput, 'uid'> & { uid?: string | null }) => {
      setIsSubmitting(true);

      try {
        if (editingInstructor) {
          // uid may be a login to link, null to unlink, or omitted (unchanged).
          await updateInstructor({ id: editingInstructor.id, ...data });
        } else {
          // Create can't carry a null uid — coerce to "no link".
          await createInstructor({ ...data, uid: data.uid ?? undefined });
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
        users={users}
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
    </>
  );
}
