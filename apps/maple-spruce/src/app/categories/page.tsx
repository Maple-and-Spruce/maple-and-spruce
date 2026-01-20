'use client';

import { useState, useCallback, useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Category, CreateCategoryInput } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { CategoryList, CategoryFormSignals } from '../../components/categories';
import { AppShell } from '../../components/layout';
import { useCategories } from '../../hooks';

export default function CategoriesPage() {
  // Category state from hook (fetches on mount)
  const {
    categoriesState,
    createCategory,
    updateCategory,
    deleteCategory: deleteCategoryApi,
    reorderCategories,
  } = useCategories();

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Calculate next order number for new categories
  const nextOrder = useMemo(() => {
    if (categoriesState.status !== 'success') return 0;
    if (categoriesState.data.length === 0) return 0;
    const maxOrder = Math.max(...categoriesState.data.map((c) => c.order));
    return maxOrder + 10; // Gap of 10 for easy reordering
  }, [categoriesState]);

  const handleOpenForm = useCallback((category?: Category) => {
    setEditingCategory(category);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingCategory(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateCategoryInput) => {
      setIsSubmitting(true);

      try {
        if (editingCategory) {
          await updateCategory({ id: editingCategory.id, ...data });
        } else {
          await createCategory(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save category:', error);
        throw error; // Re-throw to let the form display the error
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingCategory, handleCloseForm, createCategory, updateCategory]
  );

  const handleOpenDelete = useCallback((category: Category) => {
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
      console.error('Failed to delete category:', error);
      // Error will be shown via the API response
      // TODO: Show error toast
    } finally {
      setIsDeleting(false);
    }
  }, [categoryToDelete, handleCloseDelete, deleteCategoryApi]);

  const handleReorder = useCallback(
    async (orderedIds: string[]) => {
      await reorderCategories(orderedIds);
    },
    [reorderCategories]
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
          Categories
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
        >
          Add Category
        </Button>
      </Box>

      <CategoryList
        categoriesState={categoriesState}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
        onReorder={handleReorder}
      />

      <CategoryFormSignals
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
        title="Delete Category?"
        itemName={categoryToDelete?.name ?? ''}
        warningContent={
          <Typography sx={{ mt: 1, color: 'warning.main' }}>
            Note: This will fail if any products are using this category. You
            must reassign those products first.
          </Typography>
        }
      />
    </AppShell>
  );
}
