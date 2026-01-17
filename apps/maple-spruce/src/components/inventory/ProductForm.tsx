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

interface ProductFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProductInput) => Promise<void>;
  product?: Product;
  isSubmitting?: boolean;
}

const defaultFormData: CreateProductInput = {
  artistId: '',
  name: '',
  description: '',
  price: 0,
  sku: '',
  status: 'available',
};

/**
 * Basic client-side validation
 * Full validation happens on the server with vest
 */
function validateForm(data: CreateProductInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.name?.trim()) {
    errors.name = 'Name is required';
  } else if (data.name.length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }

  if (!data.artistId?.trim()) {
    errors.artistId = 'Artist is required';
  }

  if (data.price === undefined || data.price === null) {
    errors.price = 'Price is required';
  } else if (data.price <= 0) {
    errors.price = 'Price must be greater than 0';
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
  const [formData, setFormData] = useState<CreateProductInput>(defaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEdit = !!product;

  useEffect(() => {
    if (product) {
      setFormData({
        artistId: product.artistId,
        name: product.name,
        description: product.description ?? '',
        price: product.price,
        sku: product.sku ?? '',
        status: product.status,
        imageUrl: product.imageUrl,
        etsyListingId: product.etsyListingId,
      });
    } else {
      setFormData(defaultFormData);
    }
    setErrors({});
    setSubmitError(null);
  }, [product, open]);

  const handleChange = (
    field: keyof CreateProductInput,
    value: string | number | ProductStatus
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
      await onSubmit(formData);
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to save product'
      );
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
            value={formData.price}
            onChange={(e) => handleChange('price', parseFloat(e.target.value) || 0)}
            error={!!errors.price}
            helperText={errors.price}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            required
            fullWidth
          />

          <TextField
            label="SKU"
            value={formData.sku}
            onChange={(e) => handleChange('sku', e.target.value)}
            helperText="Optional identifier"
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
              <MenuItem value="available">Available</MenuItem>
              <MenuItem value="reserved">Reserved</MenuItem>
              <MenuItem value="sold">Sold</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Image URL"
            value={formData.imageUrl ?? ''}
            onChange={(e) => handleChange('imageUrl', e.target.value)}
            helperText="Optional"
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
