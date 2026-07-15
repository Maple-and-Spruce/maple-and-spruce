'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, Alert, Snackbar } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Class, CreateClassInput } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  ClassTable,
  ClassForm,
  ClassFilterToolbar,
  type ClassFilters,
} from '@maple/react/classes';
import {
  useClasses,
  useInstructors,
  useClassCategories,
  useRegistrations,
  useClassWaitlistCounts,
} from '../../../hooks';

export default function ClassesPage() {
  const router = useRouter();

  // Default to the view Katie cares about: future classes that still have spots.
  const [filters, setFilters] = useState<ClassFilters>({
    upcoming: true,
    hideFull: true,
  });

  // The server-side `useClasses` hook only knows about the upcoming/status/etc
  // filters — `hideFull` is applied client-side after we join in counts.
  const serverFilters = useMemo<ClassFilters>(
    () => ({
      status: filters.status,
      categoryId: filters.categoryId,
      instructorId: filters.instructorId,
      upcoming: filters.upcoming,
    }),
    [filters.status, filters.categoryId, filters.instructorId, filters.upcoming]
  );

  // Class state from hook (fetches on mount)
  const {
    classesState,
    createClass,
    updateClass,
    duplicateClass: duplicateClassApi,
    deleteClass: deleteClassApi,
  } = useClasses(serverFilters);

  // Instructors and categories for dropdowns
  const { instructorsState } = useInstructors();
  const { categoriesState } = useClassCategories();

  // Registration counts per class (active = pending + confirmed). Mirrors the
  // server's `RegistrationRepository.countByClassId` so "5/8" in the table
  // matches what the registration cutoff/spots-remaining logic uses.
  const { registrationsState } = useRegistrations();
  const registrationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (registrationsState.status !== 'success') return counts;
    for (const r of registrationsState.data) {
      if (r.status !== 'pending' && r.status !== 'confirmed') continue;
      counts.set(r.classId, (counts.get(r.classId) ?? 0) + (r.quantity || 1));
    }
    return counts;
  }, [registrationsState]);

  // Waitlist counts per class (classId → count), for the "Waitlist" column.
  const { waitlistCountsState } = useClassWaitlistCounts();
  const waitlistCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (waitlistCountsState.status !== 'success') return counts;
    for (const [classId, count] of Object.entries(waitlistCountsState.data)) {
      counts.set(classId, count);
    }
    return counts;
  }, [waitlistCountsState]);

  const instructors = useMemo(
    () => (instructorsState.status === 'success' ? instructorsState.data : []),
    [instructorsState]
  );

  const categories = useMemo(
    () => (categoriesState.status === 'success' ? categoriesState.data : []),
    [categoriesState]
  );

  // Apply the client-side `hideFull` filter while preserving the server-side
  // request state shape so loading/error UI still flows through.
  const filteredClassesState = useMemo(() => {
    if (classesState.status !== 'success') return classesState;
    if (!filters.hideFull) return classesState;
    return {
      ...classesState,
      data: classesState.data.filter((c) => {
        const filled = registrationCounts.get(c.id) ?? 0;
        return c.capacity === 0 || filled < c.capacity;
      }),
    };
  }, [classesState, filters.hideFull, registrationCounts]);

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Copy state
  const [duplicatingClassId, setDuplicatingClassId] = useState<string | undefined>();
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const handleFiltersChange = useCallback(
    (newFilters: ClassFilters) => {
      setFilters(newFilters);
    },
    []
  );

  const handleOpenForm = useCallback((classItem?: Class) => {
    setEditingClass(classItem);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingClass(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateClassInput) => {
      setIsSubmitting(true);

      try {
        if (editingClass) {
          await updateClass({ id: editingClass.id, ...data });
        } else {
          await createClass(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save class:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingClass, handleCloseForm, createClass, updateClass]
  );

  const handleOpenDelete = useCallback((classItem: Class) => {
    setClassToDelete(classItem);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setClassToDelete(null);
  }, []);

  const handleDuplicate = useCallback(
    async (classItem: Class) => {
      setDuplicatingClassId(classItem.id);
      setDuplicateError(null);
      try {
        const copy = await duplicateClassApi(classItem.id);
        setDuplicateMessage(`Created "${copy.name}". Set new dates to publish.`);
        // Open the new class in the edit form so Katie can fill in dates.
        setEditingClass(copy);
        setIsFormOpen(true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to copy class';
        setDuplicateError(message);
      } finally {
        setDuplicatingClassId(undefined);
      }
    },
    [duplicateClassApi]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!classToDelete) return;

    setIsDeleting(true);

    try {
      await deleteClassApi(classToDelete.id);
      handleCloseDelete();
    } catch (error) {
      console.error('Failed to delete class:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [classToDelete, handleCloseDelete, deleteClassApi]);

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
          Classes & Workshops
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
        >
          Add Class
        </Button>
      </Box>

      <ClassFilterToolbar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        instructors={instructors}
        categories={categories}
      />

      <ClassTable
        classesState={filteredClassesState}
        instructors={instructors}
        categories={categories}
        registrationCounts={registrationCounts}
        waitlistCounts={waitlistCounts}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
        onDuplicate={handleDuplicate}
        duplicatingClassId={duplicatingClassId}
        onViewRoster={(classItem) => router.push(`/classes/${classItem.id}/roster`)}
      />

      <ClassForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        classItem={editingClass}
        instructors={instructors}
        categories={categories}
        isSubmitting={isSubmitting}
        registrationCount={
          editingClass ? registrationCounts.get(editingClass.id) ?? 0 : 0
        }
      />

      <Snackbar
        open={!!duplicateMessage}
        autoHideDuration={4000}
        onClose={() => setDuplicateMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity="success"
          onClose={() => setDuplicateMessage(null)}
          variant="filled"
        >
          {duplicateMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!duplicateError}
        autoHideDuration={6000}
        onClose={() => setDuplicateError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity="error"
          onClose={() => setDuplicateError(null)}
          variant="filled"
        >
          {duplicateError}
        </Alert>
      </Snackbar>

      <DeleteConfirmDialog
        open={!!classToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Delete Class?"
        itemName={classToDelete?.name ?? ''}
        warningContent={
          <Alert severity="warning">
            Consider cancelling the class instead of deleting to preserve
            registration history. Deleting cannot be undone.
          </Alert>
        }
      />
    </>
  );
}
