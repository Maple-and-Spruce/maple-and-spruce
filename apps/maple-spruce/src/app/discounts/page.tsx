'use client';

import { useState, useCallback } from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Discount, CreateDiscountInput } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { DiscountList, DiscountForm } from '@maple/react/discounts';
import { AppShell } from '../../components/layout';
import { useDiscounts } from '../../hooks';

export default function DiscountsPage() {
  const {
    discountsState,
    createDiscount,
    updateDiscount,
    deleteDiscount: deleteDiscountApi,
  } = useDiscounts();

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<
    Discount | undefined
  >();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [discountToDelete, setDiscountToDelete] = useState<Discount | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenForm = useCallback((discount?: Discount) => {
    setEditingDiscount(discount);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingDiscount(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateDiscountInput) => {
      setIsSubmitting(true);

      try {
        if (editingDiscount) {
          await updateDiscount({ id: editingDiscount.id, ...data });
        } else {
          await createDiscount(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save discount:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingDiscount, handleCloseForm, createDiscount, updateDiscount]
  );

  const handleOpenDelete = useCallback((discount: Discount) => {
    setDiscountToDelete(discount);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDiscountToDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!discountToDelete) return;

    setIsDeleting(true);

    try {
      await deleteDiscountApi(discountToDelete.id);
      handleCloseDelete();
    } catch (error) {
      console.error('Failed to delete discount:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [discountToDelete, handleCloseDelete, deleteDiscountApi]);

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
          Discount Codes
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
        >
          Add Discount
        </Button>
      </Box>

      <DiscountList
        discountsState={discountsState}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
      />

      <DiscountForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        discount={editingDiscount}
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmDialog
        open={!!discountToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Delete Discount?"
        itemName={discountToDelete?.code ?? ''}
      />
    </AppShell>
  );
}
