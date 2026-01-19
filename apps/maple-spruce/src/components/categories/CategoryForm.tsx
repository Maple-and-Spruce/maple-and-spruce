'use client';

import { useState, useEffect } from 'react';
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

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCategoryInput) => Promise<void>;
  category?: Category;
  isSubmitting?: boolean;
  /** Next order number for new categories (used internally) */
  nextOrder?: number;
}

interface FormState {
  name: string;
  description: string;
}

const defaultFormState: FormState = {
  name: '',
  description: '',
};

/**
 * Basic client-side validation
 * Full validation happens on the server with vest
 */
function validateForm(data: FormState): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.name?.trim()) {
    errors.name = 'Name is required';
  } else if (data.name.length < 2) {
    errors.name = 'Name must be at least 2 characters';
  } else if (data.name.length > 50) {
    errors.name = 'Name must be at most 50 characters';
  }

  if (data.description && data.description.length > 200) {
    errors.description = 'Description must be at most 200 characters';
  }

  return errors;
}

export function CategoryForm({
  open,
  onClose,
  onSubmit,
  category,
  isSubmitting = false,
  nextOrder = 0,
}: CategoryFormProps) {
  const [formData, setFormData] = useState<FormState>(defaultFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEdit = !!category;

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        description: category.description ?? '',
      });
    } else {
      setFormData(defaultFormState);
    }
    setErrors({});
    setSubmitError(null);
  }, [category, open]);

  const handleChange = (field: keyof FormState, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error when field changes
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitError(null);

    try {
      const input: CreateCategoryInput = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        order: nextOrder, // Order is set automatically; reordering is done via drag-and-drop
      };

      await onSubmit(input);
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to save category'
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Category' : 'Add Category'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <TextField
            label="Category Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={!!errors.name}
            helperText={errors.name}
            placeholder="e.g., Pottery & Ceramics"
            required
            fullWidth
            autoFocus
          />

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            error={!!errors.description}
            helperText={errors.description || 'Optional'}
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
