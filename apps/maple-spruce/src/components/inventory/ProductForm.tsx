'use client';

import { useState, useEffect, useCallback } from 'react';
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
import type { Product, CreateProductInput, ProductStatus, Artist, Category } from '@maple/ts/domain';
import { toCents } from '@maple/ts/domain';
import type {
  UploadProductImageRequest,
  UploadProductImageResponse,
} from '@maple/ts/firebase/api-types';
import { ImageUpload, type ImageUploadState } from '@maple/react/ui';

interface ProductFormProps {
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
 * Form state uses user-friendly units:
 * - priceDollars: displayed as dollars, converted to cents on submit
 * - commissionPercent: displayed as 0-100%, converted to 0-1 on submit
 */
interface FormState {
  artistId: string;
  categoryId: string;
  name: string;
  description: string;
  priceDollars: number;
  quantity: number;
  status: ProductStatus;
  commissionPercent: number | ''; // 0-100, converted to 0-1 on submit; '' for empty
}

const defaultFormState: FormState = {
  artistId: '',
  categoryId: '',
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

/**
 * Read a File as base64 string (without the data URL prefix)
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ProductForm({
  open,
  onClose,
  onSubmit,
  product,
  artists,
  categories,
  isSubmitting = false,
}: ProductFormProps) {
  // Filter to only active artists for the dropdown
  const activeArtists = artists.filter((a) => a.status === 'active');
  const [formData, setFormData] = useState<FormState>(defaultFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Image upload state - only available when editing (product has Square ID)
  const [imageUploadState, setImageUploadState] = useState<ImageUploadState>({
    status: 'idle',
  });
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);

  const isEdit = !!product;

  useEffect(() => {
    if (product) {
      // Convert from Product (with squareCache) to form state
      setFormData({
        artistId: product.artistId,
        categoryId: product.categoryId ?? '',
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
      // If product has an existing image, show it as success state
      if (product.squareCache.imageUrl) {
        setImageUploadState({ status: 'success', url: product.squareCache.imageUrl });
      } else {
        setImageUploadState({ status: 'idle' });
      }
    } else {
      setFormData(defaultFormState);
      setImageUploadState({ status: 'idle' });
    }
    setPendingImageFile(null);
    setErrors({});
    setSubmitError(null);
  }, [product, open]);

  const handleImageSelected = useCallback((file: File, previewUrl: string) => {
    setPendingImageFile(file);
    setImageUploadState({ status: 'previewing', previewUrl, file });
  }, []);

  const handleImageRemove = useCallback(() => {
    setPendingImageFile(null);
    setImageUploadState({ status: 'removed' });
  }, []);

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

  /**
   * Upload image to Square via Firebase function
   * Only available when editing (product must exist in Square)
   */
  const uploadImage = async (file: File, productId: string): Promise<string> => {
    const functions = getMapleFunctions();
    const upload = httpsCallable<UploadProductImageRequest, UploadProductImageResponse>(
      functions,
      'uploadProductImage'
    );

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
        categoryId: formData.categoryId || undefined,
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

      // If editing and there's a pending image to upload, upload it first
      if (isEdit && product && pendingImageFile) {
        setImageUploadState({
          status: 'uploading',
          previewUrl:
            imageUploadState.status === 'previewing'
              ? imageUploadState.previewUrl
              : '',
        });

        try {
          const imageUrl = await uploadImage(pendingImageFile, product.id);
          setImageUploadState({ status: 'success', url: imageUrl });
        } catch (uploadError) {
          const errorMessage =
            uploadError instanceof Error
              ? uploadError.message
              : 'Failed to upload image';
          setImageUploadState({
            status: 'error',
            error: errorMessage,
            previewUrl:
              imageUploadState.status === 'previewing'
                ? imageUploadState.previewUrl
                : undefined,
          });
          setSubmitError(`Image upload failed: ${errorMessage}`);
          return;
        }
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

          <FormControl fullWidth required error={!!errors.artistId}>
            <InputLabel>Artist</InputLabel>
            <Select
              value={formData.artistId}
              label="Artist"
              onChange={(e) => handleChange('artistId', e.target.value)}
            >
              {activeArtists.map((artist) => (
                <MenuItem key={artist.id} value={artist.id}>
                  {artist.name}
                </MenuItem>
              ))}
            </Select>
            {errors.artistId && <FormHelperText>{errors.artistId}</FormHelperText>}
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={formData.categoryId}
              label="Category"
              onChange={(e) => handleChange('categoryId', e.target.value)}
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

          {/* Image Upload - only available when editing (product must exist in Square) */}
          {isEdit ? (
            <ImageUpload
              state={imageUploadState}
              onFileSelected={handleImageSelected}
              onRemove={handleImageRemove}
              existingImageUrl={product?.squareCache.imageUrl}
              label="Product Image"
            />
          ) : (
            <Alert severity="info">
              Product images can be added after creation
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting || imageUploadState.status === 'uploading'}
        >
          {isSubmitting || imageUploadState.status === 'uploading'
            ? 'Saving...'
            : isEdit
              ? 'Update'
              : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
