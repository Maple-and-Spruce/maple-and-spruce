'use client';

import { useState, useCallback, useMemo } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Class, CreateClassInput } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  ClassList,
  ClassForm,
  ClassFilterToolbar,
  type ClassFilters,
} from '@maple/react/classes';
import { AppShell } from '../../components/layout';
import { useClasses, useInstructors, useClassCategories } from '../../hooks';

export default function ClassesPage() {
  // Filter state
  const [filters, setFilters] = useState<ClassFilters>({});

  // Class state from hook (fetches on mount)
  const {
    classesState,
    createClass,
    updateClass,
    deleteClass: deleteClassApi,
  } = useClasses(filters);

  // Instructors and categories for dropdowns
  const { instructorsState } = useInstructors();
  const { categoriesState } = useClassCategories();

  const instructors = useMemo(
    () => (instructorsState.status === 'success' ? instructorsState.data : []),
    [instructorsState]
  );

  const categories = useMemo(
    () => (categoriesState.status === 'success' ? categoriesState.data : []),
    [categoriesState]
  );

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

      <ClassList
        classesState={classesState}
        instructors={instructors}
        categories={categories}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
      />

      <ClassForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        classItem={editingClass}
        instructors={instructors}
        categories={categories}
        isSubmitting={isSubmitting}
      />

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
    </AppShell>
  );
}
