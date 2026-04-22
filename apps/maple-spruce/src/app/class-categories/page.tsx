'use client';

import { useState, useCallback, useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { ClassCategory, CreateClassCategoryInput } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  ClassCategoryList,
  ClassCategoryForm,
} from '../../components/class-categories';
import { AppShell } from '../../components/layout';
import { useClassCategories } from '../../hooks';

export default function ClassCategoriesPage() {
  const {
    categoriesState,
    createClassCategory,
    updateClassCategory,
    deleteClassCategory: deleteCategoryApi,
    reorderClassCategories,
  } = useClassCategories();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<
    ClassCategory | undefined
  >();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [categoryToDelete, setCategoryToDelete] =
    useState<ClassCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const nextOrder = useMemo(() => {
    if (categoriesState.status !== 'success') return 0;
    if (categoriesState.data.length === 0) return 0;
    const maxOrder = Math.max(...categoriesState.data.map((c) => c.order));
    return maxOrder + 10;
  }, [categoriesState]);

  const handleOpenForm = useCallback((category?: ClassCategory) => {
    setEditingCategory(category);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingCategory(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateClassCategoryInput) => {
      setIsSubmitting(true);

      try {
        if (editingCategory) {
          await updateClassCategory({ id: editingCategory.id, ...data });
        } else {
          await createClassCategory(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save class category:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingCategory, handleCloseForm, createClassCategory, updateClassCategory]
  );

  const handleOpenDelete = useCallback((category: ClassCategory) => {
    setCategoryToDelete(category);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setCategoryToDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!categoryToDelete) return;

    setIsDeleting(true);

    try {
      await deleteCategoryApi(categoryToDelete.id);
      handleCloseDelete();
    } catch (error) {
      console.error('Failed to delete class category:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [categoryToDelete, handleCloseDelete, deleteCategoryApi]);

  const handleReorder = useCallback(
    async (orderedIds: string[]) => {
      await reorderClassCategories(orderedIds);
    },
    [reorderClassCategories]
  );

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
          Class Categories
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
        >
          Add Category
        </Button>
      </Box>

      <ClassCategoryList
        categoriesState={categoriesState}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
        onReorder={handleReorder}
      />

      <ClassCategoryForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        category={editingCategory}
        isSubmitting={isSubmitting}
        nextOrder={nextOrder}
      />

      <DeleteConfirmDialog
        open={!!categoryToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Delete Class Category?"
        itemName={categoryToDelete?.name ?? ''}
        warningContent={
          <Typography sx={{ mt: 1, color: 'warning.main' }}>
            Note: This will fail if any classes are using this category. You
            must reassign those classes first.
          </Typography>
        }
      />
    </AppShell>
  );
}
