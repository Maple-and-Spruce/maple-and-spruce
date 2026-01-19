'use client';

import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import type { Category } from '@maple/ts/domain';

interface DeleteConfirmDialogProps {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteConfirmDialog({
  open,
  category,
  onClose,
  onConfirm,
  isDeleting = false,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Category?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete &quot;{category?.name}&quot;?
        </DialogContentText>
        <DialogContentText sx={{ mt: 1, color: 'warning.main' }}>
          Note: This will fail if any products are using this category. You must
          reassign those products first.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
