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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Alert,
} from '@mui/material';
import type { Product, CreateProductInput, ProductStatus } from '@maple/ts/domain';
import { toCents } from '@maple/ts/domain';

interface ProductFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProductInput) => Promise<void>;
  product?: Product;
  isSubmitting?: boolean;
}

/**
 * Form state uses user-friendly units:
 * - priceDollars: displayed as dollars, converted to cents on submit
 * - commissionPercent: displayed as 0-100%, converted to 0-1 on submit
 */
interface FormState {
  artistId: string;
  name: string;
  description: string;
  priceDollars: number;
  quantity: number;
  status: ProductStatus;
  commissionPercent: number | ''; // 0-100, converted to 0-1 on submit; '' for empty
}

const defaultFormState: FormState = {
  artistId: '',
  name: '',
  description: '',
  priceDollars: 0,
  quantity: 1,
  status: 'active',
  commissionPercent: '',
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
  }

  if (!data.artistId?.trim()) {
    errors.artistId = 'Artist is required';
  }

  if (data.priceDollars === undefined || data.priceDollars === null) {
    errors.priceDollars = 'Price is required';
  } else if (data.priceDollars <= 0) {
    errors.priceDollars = 'Price must be greater than 0';
  }

  if (data.quantity < 0) {
    errors.quantity = 'Quantity cannot be negative';
  }

  if (!data.status) {
    errors.status = 'Status is required';
  }

  return errors;
}

export function ProductForm({
  open,
  onClose,
  onSubmit,
  product,
  isSubmitting = false,
}: ProductFormProps) {
  const [formData, setFormData] = useState<FormState>(defaultFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEdit = !!product;

  useEffect(() => {
    if (product) {
      // Convert from Product (with squareCache) to form state
      setFormData({
        artistId: product.artistId,
        name: product.squareCache.name,
        description: product.squareCache.description ?? '',
        priceDollars: product.squareCache.priceCents / 100, // Convert cents to dollars
        quantity: product.squareCache.quantity,
        status: product.status,
        // Convert decimal (0-1) to percentage (0-100) for display
        commissionPercent:
          product.customCommissionRate !== undefined
            ? product.customCommissionRate * 100
            : '',
      });
    } else {
      setFormData(defaultFormState);
    }
    setErrors({});
    setSubmitError(null);
  }, [product, open]);

  const handleChange = (
    field: keyof FormState,
    value: string | number | ProductStatus | ''
  ) => {
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
      // Convert form state to CreateProductInput
      const input: CreateProductInput = {
        artistId: formData.artistId,
        name: formData.name,
        description: formData.description || undefined,
        priceCents: toCents(formData.priceDollars), // Convert dollars to cents
        quantity: formData.quantity,
        status: formData.status,
      };

      // Convert percentage (0-100) to decimal (0-1) if provided
      if (
        formData.commissionPercent !== '' &&
        formData.commissionPercent !== undefined &&
        !Number.isNaN(formData.commissionPercent)
      ) {
        input.customCommissionRate = formData.commissionPercent / 100;
      }

      await onSubmit(input);
      onClose();
    } catch (error: unknown) {
      // Extract meaningful error message from Firebase/API errors
      let message = 'Failed to save product';
      if (error instanceof Error) {
        message = error.message;
      } else if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error
      ) {
        message = String((error as { message: unknown }).message);
      }
      setSubmitError(message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Product' : 'Add Product'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <TextField
            label="Product Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={!!errors.name}
            helperText={errors.name}
            required
            fullWidth
          />

          <TextField
            label="Artist ID"
            value={formData.artistId}
            onChange={(e) => handleChange('artistId', e.target.value)}
            error={!!errors.artistId}
            helperText={errors.artistId || 'Temporary: enter artist ID manually'}
            required
            fullWidth
          />

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            multiline
            rows={3}
            fullWidth
          />

          <TextField
            label="Price"
            type="number"
            value={formData.priceDollars}
            onChange={(e) =>
              handleChange('priceDollars', parseFloat(e.target.value) || 0)
            }
            error={!!errors.priceDollars}
            helperText={errors.priceDollars}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            inputProps={{ step: 0.01, min: 0 }}
            required
            fullWidth
          />

          <TextField
            label="Quantity"
            type="number"
            value={formData.quantity}
            onChange={(e) =>
              handleChange('quantity', parseInt(e.target.value) || 0)
            }
            error={!!errors.quantity}
            helperText={errors.quantity}
            inputProps={{ min: 0 }}
            required
            fullWidth
          />

          <FormControl fullWidth error={!!errors.status}>
            <InputLabel>Status</InputLabel>
            <Select
              value={formData.status}
              label="Status"
              onChange={(e) =>
                handleChange('status', e.target.value as ProductStatus)
              }
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="discontinued">Discontinued</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Custom Commission Rate (%)"
            type="number"
            value={formData.commissionPercent}
            onChange={(e) => {
              const val = e.target.value;
              handleChange(
                'commissionPercent',
                val === '' ? '' : parseFloat(val)
              );
            }}
            helperText="Optional override (e.g., 30 = 30%)"
            inputProps={{ step: 1, min: 0, max: 100 }}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
