'use client';

import { useState, useCallback } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type {
  Discount,
  CreateDiscountInput,
  UpdateDiscountInput,
  DiscountProgram,
  RequestState,
} from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { DiscountList } from './DiscountList';
import { DiscountForm } from './DiscountForm';

export interface DiscountsManagerProps {
  /**
   * The program these codes belong to. Every code created here is stamped
   * with it, and the caller is expected to have fetched a list already
   * filtered to it — this component never mixes programs.
   */
  program: DiscountProgram;
  /** Page heading, e.g. "Class Discount Codes". */
  title: string;
  /** One line under the heading saying where these codes are redeemed. */
  description: string;
  discountsState: RequestState<Discount[]>;
  onCreate: (input: CreateDiscountInput) => Promise<unknown>;
  onUpdate: (input: UpdateDiscountInput) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

/**
 * The whole discount-code management experience — list, create, edit, delete —
 * for exactly one program.
 *
 * Both admin pages render this: `/discounts` for Maple & Spruce classes and
 * `/music-together/discounts` for Music Together. They differ only in the
 * `program` they pin and the copy they pass, so the two experiences cannot
 * drift apart as either evolves. The program is never a form field: it is
 * immutable on a `Discount`, and the page the user is standing on already
 * says which one they mean.
 */
export function DiscountsManager({
  program,
  title,
  description,
  discountsState,
  onCreate,
  onUpdate,
  onDelete,
}: DiscountsManagerProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [discountToDelete, setDiscountToDelete] = useState<Discount | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          await onUpdate({ id: editingDiscount.id, ...data });
        } else {
          await onCreate(data);
        }
        handleCloseForm();
      } catch (error) {
        // Surfaced inline by DiscountForm, which shows the thrown message.
        console.error('Failed to save discount:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingDiscount, handleCloseForm, onCreate, onUpdate]
  );

  const handleOpenDelete = useCallback((discount: Discount) => {
    setDiscountToDelete(discount);
    setDeleteError(null);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDiscountToDelete(null);
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!discountToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(discountToDelete.id);
      setDiscountToDelete(null);
    } catch (error) {
      // The delete dialog has nowhere to show a failure, so surface it on the
      // page rather than closing as though it worked.
      setDeleteError(
        error instanceof Error ? error.message : 'Failed to delete discount'
      );
    } finally {
      setIsDeleting(false);
    }
  }, [discountToDelete, onDelete]);

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
          sx={{ flexShrink: 0 }}
        >
          Add Discount
        </Button>
      </Box>

      {deleteError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setDeleteError(null)}
        >
          {deleteError}
        </Alert>
      )}

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
        program={program}
      />

      <DeleteConfirmDialog
        open={!!discountToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Delete Discount?"
        itemName={discountToDelete?.code ?? ''}
      />
    </>
  );
}
