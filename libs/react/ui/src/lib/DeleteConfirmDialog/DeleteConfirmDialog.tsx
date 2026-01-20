'use client';

import type { ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from '@mui/material';

export interface DeleteConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog is closed (cancel or backdrop click) */
  onClose: () => void;
  /** Called when the user confirms deletion */
  onConfirm: () => void;
  /** Whether a delete operation is in progress */
  isDeleting?: boolean;
  /** Dialog title, e.g. "Delete Artist?" */
  title: string;
  /** Name of the item being deleted, displayed in the confirmation message */
  itemName: string;
  /** Optional warning content to display below the confirmation message */
  warningContent?: ReactNode;
  /** Custom confirmation message. Defaults to "Are you sure you want to delete..." */
  confirmationMessage?: string;
}

/**
 * Generic delete confirmation dialog
 *
 * Consolidates the common delete confirmation pattern used across
 * artists, products, and categories into a single reusable component.
 *
 * @example
 * // Basic usage
 * <DeleteConfirmDialog
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Artist?"
 *   itemName={artist.name}
 * />
 *
 * @example
 * // With warning content
 * <DeleteConfirmDialog
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Artist?"
 *   itemName={artist.name}
 *   warningContent={
 *     <Alert severity="warning">
 *       Consider setting inactive instead to preserve historical records.
 *     </Alert>
 *   }
 * />
 */
export function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  isDeleting = false,
  title,
  itemName,
  warningContent,
  confirmationMessage,
}: DeleteConfirmDialogProps) {
  const message =
    confirmationMessage ??
    `Are you sure you want to delete "${itemName}"? This action cannot be undone.`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: warningContent ? 2 : 0 }}>{message}</Typography>
        {warningContent}
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
