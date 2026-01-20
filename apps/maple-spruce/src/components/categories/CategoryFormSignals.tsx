'use client';

/**
 * CategoryFormSignals - Signals-based Category Form
 *
 * Migrated from CategoryForm.tsx to use Preact Signals for state management.
 * This is a simpler form than ArtistFormSignals - just name and description.
 *
 * Benefits:
 * 1. Automatic validation via Vest - no manual error clearing
 * 2. Fine-grained reactivity - each field updates independently
 * 3. Cleaner code - direct signal assignments
 *
 * @see docs/SIGNALS-MIGRATION-GUIDE.md
 */

import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';
import type { Category, CreateCategoryInput } from '@maple/ts/domain';
import { categoryValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  useSignalEffect,
  batch,
  useSignals,
} from '@maple/react/signals';

interface CategoryFormSignalsProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCategoryInput) => Promise<void>;
  category?: Category;
  isSubmitting?: boolean;
  /** Next order number for new categories (used internally) */
  nextOrder?: number;
}

export function CategoryFormSignals({
  open,
  onClose,
  onSubmit,
  category,
  isSubmitting = false,
  nextOrder = 0,
}: CategoryFormSignalsProps) {
  // Enable signals tracking in this component
  useSignals();

  // ============================================================
  // FORM FIELD SIGNALS
  // ============================================================
  const name = useSignal('');
  const description = useSignal('');

  // ============================================================
  // UI STATE SIGNALS
  // ============================================================
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const isEdit = !!category;

  // ============================================================
  // VALIDATION - Computed signals that auto-track dependencies
  // ============================================================

  // Validation runs automatically when ANY form field changes
  const validation = useComputed(() => {
    return categoryValidation({
      name: name.value,
      description: description.value || undefined,
      order: isEdit ? category.order : nextOrder,
    });
  });

  // Errors computed - only shows after first submit attempt
  const errors = useComputed<Record<string, string[]>>(() => {
    if (!showValidationErrors.value) return {};
    return validation.value.getErrors();
  });

  // Convenience: is form currently valid
  const isValid = useComputed(() => validation.value.isValid());

  // Helper to get first error for a field
  const getFieldError = (field: string): string | null => {
    const fieldErrors = errors.value[field];
    return fieldErrors?.[0] ?? null;
  };

  // ============================================================
  // EFFECTS - Populate form when category prop changes
  // ============================================================

  useSignalEffect(() => {
    // Only run when dialog opens or category changes
    if (!open) return;

    if (category) {
      // Populate form from existing category
      batch(() => {
        name.value = category.name;
        description.value = category.description ?? '';
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      // Reset to defaults for new category
      batch(() => {
        name.value = '';
        description.value = '';
        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
  });

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  const handleSubmit = async () => {
    // Show validation errors on first submit attempt
    showValidationErrors.value = true;

    // Check validity
    if (!isValid.value) {
      return;
    }

    submitError.value = null;

    try {
      const input: CreateCategoryInput = {
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        order: isEdit ? category.order : nextOrder,
      };

      await onSubmit(input);
      onClose();
    } catch (error: unknown) {
      let message = 'Failed to save category';
      if (error instanceof Error) {
        message = error.message;
      } else if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error
      ) {
        message = String((error as { message: unknown }).message);
      }
      submitError.value = message;
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Category' : 'Add Category'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          {/* Name - signals update directly */}
          <TextField
            label="Category Name"
            value={name.value}
            onChange={(e) => (name.value = e.target.value)}
            error={!!getFieldError('name')}
            helperText={getFieldError('name')}
            placeholder="e.g., Pottery & Ceramics"
            required
            fullWidth
            autoFocus
          />

          {/* Description */}
          <TextField
            label="Description"
            value={description.value}
            onChange={(e) => (description.value = e.target.value)}
            error={!!getFieldError('description')}
            helperText={getFieldError('description') || 'Optional'}
            multiline
            rows={2}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
