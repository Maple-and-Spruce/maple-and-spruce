'use client';

/**
 * ProductFormSignals - Signals-based Product Form
 *
 * Pilot implementation using Preact Signals for state management.
 * Demonstrates the migration pattern from useState to signals.
 *
 * Key improvements over the original ProductForm:
 * 1. Automatic validation - no manual error clearing
 * 2. Fine-grained reactivity - each field updates independently
 * 3. Cleaner code - no handleChange wrapper
 * 4. Always-current derived state - isValid, errors auto-update
 *
 * @see docs/SIGNALS-MIGRATION-GUIDE.md
 */

import { useCallback } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Alert,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Product,
  CreateProductInput,
  ProductStatus,
  Artist,
  Category,
} from '@maple/ts/domain';
import { toCents } from '@maple/ts/domain';
import type {
  UploadProductImageRequest,
  UploadProductImageResponse,
} from '@maple/ts/firebase/api-types';
import { ImageUpload, type ImageUploadState } from '@maple/react/ui';
import { productValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  useSignalEffect,
  batch,
  useSignals,
} from '@maple/react/signals';

interface ProductFormSignalsProps {
  open: boolean;
  onClose: () => void;
  /** Returns the created/updated product so we can upload images after creation */
  onSubmit: (data: CreateProductInput) => Promise<Product | void>;
  product?: Product;
  artists: Artist[];
  categories: Category[];
  isSubmitting?: boolean;
}

/**
 * Read a File as base64 string (without the data URL prefix)
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ProductFormSignals({
  open,
  onClose,
  onSubmit,
  product,
  artists,
  categories,
  isSubmitting = false,
}: ProductFormSignalsProps) {
  // Enable signals tracking in this component
  useSignals();

  // Filter to only active artists for the dropdown
  const activeArtists = artists.filter((a) => a.status === 'active');

  // ============================================================
  // FORM FIELD SIGNALS
  // Each field is its own signal - enables fine-grained updates
  // ============================================================
  const artistId = useSignal('');
  const categoryId = useSignal('');
  const name = useSignal('');
  const description = useSignal('');
  const priceDollars = useSignal(0);
  const quantity = useSignal(1);
  const status = useSignal<ProductStatus>('active');
  const commissionPercent = useSignal<number | ''>('');

  // ============================================================
  // UI STATE SIGNALS
  // ============================================================
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);
  const imageUploadState = useSignal<ImageUploadState>({ status: 'idle' });
  const pendingImageFile = useSignal<File | null>(null);
  /** Tracks submission phase for progress feedback */
  const submissionPhase = useSignal<'idle' | 'creating' | 'uploading-image'>('idle');

  const isEdit = !!product;

  // ============================================================
  // VALIDATION - Computed signals that auto-track dependencies
  // ============================================================

  // Validation runs automatically when ANY form field changes
  const validation = useComputed(() => {
    return productValidation({
      artistId: artistId.value,
      name: name.value,
      priceCents: Math.round(priceDollars.value * 100),
      quantity: quantity.value,
      status: status.value,
      // Only include commission if provided
      customCommissionRate:
        commissionPercent.value !== '' &&
        !Number.isNaN(commissionPercent.value)
          ? commissionPercent.value / 100
          : undefined,
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
  // EFFECTS - Populate form when product prop changes
  // ============================================================

  useSignalEffect(() => {
    // Only run when dialog opens or product changes
    if (!open) return;

    if (product) {
      // Populate form from existing product
      batch(() => {
        artistId.value = product.artistId;
        categoryId.value = product.categoryId ?? '';
        name.value = product.squareCache.name;
        description.value = product.squareCache.description ?? '';
        priceDollars.value = product.squareCache.priceCents / 100;
        quantity.value = product.squareCache.quantity;
        status.value = product.status;
        commissionPercent.value =
          product.customCommissionRate !== undefined
            ? product.customCommissionRate * 100
            : '';

        // Set image state
        if (product.squareCache.imageUrl) {
          imageUploadState.value = {
            status: 'success',
            url: product.squareCache.imageUrl,
          };
        } else {
          imageUploadState.value = { status: 'idle' };
        }

        pendingImageFile.value = null;
        showValidationErrors.value = false;
        submitError.value = null;
        submissionPhase.value = 'idle';
      });
    } else {
      // Reset to defaults for new product
      batch(() => {
        artistId.value = '';
        categoryId.value = '';
        name.value = '';
        description.value = '';
        priceDollars.value = 0;
        quantity.value = 1;
        status.value = 'active';
        commissionPercent.value = '';
        imageUploadState.value = { status: 'idle' };
        pendingImageFile.value = null;
        showValidationErrors.value = false;
        submitError.value = null;
        submissionPhase.value = 'idle';
      });
    }
  });

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  const handleImageSelected = useCallback((file: File, previewUrl: string) => {
    pendingImageFile.value = file;
    imageUploadState.value = { status: 'previewing', previewUrl, file };
  }, []);

  const handleImageRemove = useCallback(() => {
    pendingImageFile.value = null;
    imageUploadState.value = { status: 'removed' };
  }, []);

  /**
   * Upload image to Square via Firebase function
   */
  const uploadImage = async (file: File, productId: string): Promise<string> => {
    const functions = getMapleFunctions();
    const upload = httpsCallable<
      UploadProductImageRequest,
      UploadProductImageResponse
    >(functions, 'uploadProductImage');

    const imageBase64 = await readFileAsBase64(file);

    const result = await upload({
      productId,
      imageBase64,
      contentType: file.type,
    });

    if (!result.data.success) {
      throw new Error('Image upload failed');
    }

    return result.data.imageUrl;
  };

  const handleSubmit = async () => {
    // Show validation errors on first submit attempt
    showValidationErrors.value = true;

    // Check validity
    if (!isValid.value) {
      return;
    }

    submitError.value = null;

    try {
      // Build the input from signal values
      const input: CreateProductInput = {
        artistId: artistId.value,
        categoryId: categoryId.value || undefined,
        name: name.value,
        description: description.value || undefined,
        priceCents: toCents(priceDollars.value),
        quantity: quantity.value,
        status: status.value,
      };

      // Add commission rate if provided
      if (
        commissionPercent.value !== '' &&
        !Number.isNaN(commissionPercent.value)
      ) {
        input.customCommissionRate = commissionPercent.value / 100;
      }

      // Capture preview URL for image upload state updates
      const currentPreviewUrl =
        imageUploadState.value.status === 'previewing'
          ? imageUploadState.value.previewUrl
          : '';

      // Handle image upload for EXISTING products (edit mode)
      if (isEdit && product && pendingImageFile.value) {
        imageUploadState.value = {
          status: 'uploading',
          previewUrl: currentPreviewUrl,
        };

        try {
          const imageUrl = await uploadImage(pendingImageFile.value, product.id);
          imageUploadState.value = { status: 'success', url: imageUrl };
        } catch (uploadError) {
          const errorMessage =
            uploadError instanceof Error
              ? uploadError.message
              : 'Failed to upload image';
          imageUploadState.value = {
            status: 'error',
            error: errorMessage,
            previewUrl: currentPreviewUrl || undefined,
          };
          submitError.value = `Image upload failed: ${errorMessage}`;
          return;
        }
      }

      // Create/update the product
      submissionPhase.value = isEdit ? 'idle' : 'creating';
      const result = await onSubmit(input);

      // Handle image upload for NEW products (after creation)
      if (!isEdit && pendingImageFile.value && result) {
        submissionPhase.value = 'uploading-image';
        imageUploadState.value = {
          status: 'uploading',
          previewUrl: currentPreviewUrl,
        };

        try {
          const imageUrl = await uploadImage(pendingImageFile.value, result.id);
          imageUploadState.value = { status: 'success', url: imageUrl };
        } catch (uploadError) {
          // Image upload failed, but product was created
          // Show error but still close - user can add image later
          const errorMessage =
            uploadError instanceof Error
              ? uploadError.message
              : 'Failed to upload image';
          console.error('Image upload failed after product creation:', errorMessage);
          // Don't block - product was created successfully
        }
      }

      submissionPhase.value = 'idle';
      onClose();
    } catch (error: unknown) {
      submissionPhase.value = 'idle';
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
      submitError.value = message;
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Product' : 'Add Product'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          {/* Product Name - signals update directly, no handleChange wrapper */}
          <TextField
            label="Product Name"
            value={name.value}
            onChange={(e) => (name.value = e.target.value)}
            error={!!getFieldError('name')}
            helperText={getFieldError('name')}
            required
            fullWidth
          />

          {/* Artist Select */}
          <FormControl fullWidth required error={!!getFieldError('artistId')}>
            <InputLabel>Artist</InputLabel>
            <Select
              value={artistId.value}
              label="Artist"
              onChange={(e) => (artistId.value = e.target.value)}
            >
              {activeArtists.map((artist) => (
                <MenuItem key={artist.id} value={artist.id}>
                  {artist.name}
                </MenuItem>
              ))}
            </Select>
            {getFieldError('artistId') && (
              <FormHelperText>{getFieldError('artistId')}</FormHelperText>
            )}
          </FormControl>

          {/* Category Select */}
          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryId.value}
              label="Category"
              onChange={(e) => (categoryId.value = e.target.value)}
            >
              <MenuItem value="">
                <em>Uncategorized</em>
              </MenuItem>
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Description */}
          <TextField
            label="Description"
            value={description.value}
            onChange={(e) => (description.value = e.target.value)}
            multiline
            rows={3}
            fullWidth
          />

          {/* Price */}
          <TextField
            label="Price"
            type="number"
            value={priceDollars.value}
            onChange={(e) =>
              (priceDollars.value = parseFloat(e.target.value) || 0)
            }
            error={!!getFieldError('priceCents')}
            helperText={getFieldError('priceCents')}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
            }}
            inputProps={{ step: 0.01, min: 0 }}
            required
            fullWidth
          />

          {/* Quantity */}
          <TextField
            label="Quantity"
            type="number"
            value={quantity.value}
            onChange={(e) =>
              (quantity.value = parseInt(e.target.value, 10) || 0)
            }
            error={!!getFieldError('quantity')}
            helperText={getFieldError('quantity')}
            inputProps={{ min: 0 }}
            required
            fullWidth
          />

          {/* Status */}
          <FormControl fullWidth error={!!getFieldError('status')}>
            <InputLabel>Status</InputLabel>
            <Select
              value={status.value}
              label="Status"
              onChange={(e) => (status.value = e.target.value as ProductStatus)}
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="discontinued">Discontinued</MenuItem>
            </Select>
          </FormControl>

          {/* Commission Rate */}
          <TextField
            label="Custom Commission Rate (%)"
            type="number"
            value={commissionPercent.value}
            onChange={(e) => {
              const val = e.target.value;
              commissionPercent.value = val === '' ? '' : parseFloat(val);
            }}
            error={!!getFieldError('customCommissionRate')}
            helperText={
              getFieldError('customCommissionRate') ||
              'Optional override (e.g., 30 = 30%)'
            }
            inputProps={{ step: 1, min: 0, max: 100 }}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
            fullWidth
          />

          {/* Image Upload - available for both create and edit */}
          <ImageUpload
            state={imageUploadState.value}
            onFileSelected={handleImageSelected}
            onRemove={handleImageRemove}
            existingImageUrl={product?.squareCache.imageUrl}
            label="Product Image"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          disabled={isSubmitting || submissionPhase.value !== 'idle'}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            isSubmitting ||
            imageUploadState.value.status === 'uploading' ||
            submissionPhase.value !== 'idle'
          }
        >
          {submissionPhase.value === 'creating'
            ? 'Creating product...'
            : submissionPhase.value === 'uploading-image'
              ? 'Uploading image...'
              : isSubmitting || imageUploadState.value.status === 'uploading'
                ? 'Saving...'
                : isEdit
                  ? 'Update'
                  : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
