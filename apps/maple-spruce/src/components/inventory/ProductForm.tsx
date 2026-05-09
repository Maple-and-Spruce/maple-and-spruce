'use client';

/**
 * ProductForm - Product Form using Preact Signals
 *
 * Uses Preact Signals for state management which provides:
 * 1. Automatic validation - no manual error clearing
 * 2. Fine-grained reactivity - each field updates independently
 * 3. Cleaner code - no handleChange wrapper
 * 4. Always-current derived state - isValid, errors auto-update
 */

import { useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Product,
  CreateProductInput,
  CreateVariantInput,
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
import { ProductEtsySection } from './ProductEtsySection';
import { productValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

/**
 * Editable shape for a single variant row in the form. SKU is optional —
 * the backend auto-generates one when missing.
 */
interface VariantRow {
  label: string;
  priceDollars: number;
  quantity: number;
  sku: string;
}

function emptyVariantRow(label = ''): VariantRow {
  return { label, priceDollars: 0, quantity: 0, sku: '' };
}

function rowToCreateInput(row: VariantRow): CreateVariantInput {
  const base: CreateVariantInput = {
    label: row.label.trim(),
    priceCents: toCents(row.priceDollars),
    quantity: row.quantity,
  };
  return row.sku.trim() ? { ...base, sku: row.sku.trim() } : base;
}

function parseVariantProperties(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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

export function ProductForm({
  open,
  onClose,
  onSubmit,
  product,
  artists,
  categories,
  isSubmitting = false,
}: ProductFormProps) {
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
  // VARIANT SIGNALS
  // Single mode reuses priceDollars/quantity above.
  // Multi mode drives the table below.
  // ============================================================
  const variantMode = useSignal<'single' | 'multi'>('single');
  const variants = useSignal<VariantRow[]>([]);
  const variantPropertiesText = useSignal('');

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
    const customCommissionRate =
      commissionPercent.value !== '' && !Number.isNaN(commissionPercent.value)
        ? commissionPercent.value / 100
        : undefined;

    if (variantMode.value === 'multi') {
      return productValidation({
        artistId: artistId.value,
        name: name.value,
        status: status.value,
        customCommissionRate,
        variants: variants.value.map(rowToCreateInput),
        variantProperties: parseVariantProperties(variantPropertiesText.value),
      });
    }

    return productValidation({
      artistId: artistId.value,
      name: name.value,
      priceCents: Math.round(priceDollars.value * 100),
      quantity: quantity.value,
      status: status.value,
      customCommissionRate,
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
  // NOTE: We use React's useEffect here instead of useSignalEffect because
  // useSignalEffect only tracks signal changes, not React prop changes.
  // The `open` and `product` props are regular React props that need to be
  // tracked via the dependency array.
  // ============================================================

  useEffect(() => {
    // Only run when dialog opens
    if (!open) return;

    if (product) {
      // Populate form from existing product
      const productVariants = product.variants ?? [];
      const isMulti = productVariants.length > 1;
      const firstVariant = productVariants[0];

      batch(() => {
        artistId.value = product.artistId;
        categoryId.value = product.categoryId ?? '';
        name.value = product.squareCache.name;
        description.value = product.squareCache.description ?? '';
        status.value = product.status;
        commissionPercent.value =
          product.customCommissionRate !== undefined
            ? product.customCommissionRate * 100
            : '';

        if (isMulti) {
          variantMode.value = 'multi';
          variants.value = productVariants.map((v) => ({
            label: v.label,
            priceDollars: v.priceCents / 100,
            quantity: v.quantity,
            sku: v.sku,
          }));
          variantPropertiesText.value = (product.variantProperties ?? []).join(
            ', '
          );
          // Single-variant fields aren't shown in multi mode, but seed them
          // so a mid-edit switch back to single doesn't surprise the user.
          priceDollars.value = (firstVariant?.priceCents ?? 0) / 100;
          quantity.value = firstVariant?.quantity ?? 0;
        } else {
          variantMode.value = 'single';
          priceDollars.value =
            (firstVariant?.priceCents ?? product.squareCache.priceCents ?? 0) /
            100;
          quantity.value =
            firstVariant?.quantity ?? product.squareCache.quantity ?? 0;
          variants.value = [];
          variantPropertiesText.value = '';
        }

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
        variantMode.value = 'single';
        variants.value = [];
        variantPropertiesText.value = '';
        imageUploadState.value = { status: 'idle' };
        pendingImageFile.value = null;
        showValidationErrors.value = false;
        submitError.value = null;
        submissionPhase.value = 'idle';
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

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

  const handleSwitchToMulti = useCallback(() => {
    batch(() => {
      // Seed with two rows so the user has something to fill in immediately.
      // Row 0 carries over the current single-variant price/qty so nothing is
      // lost when switching modes.
      variants.value = [
        {
          label: 'Variant 1',
          priceDollars: priceDollars.value,
          quantity: quantity.value,
          sku: '',
        },
        emptyVariantRow('Variant 2'),
      ];
      variantMode.value = 'multi';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwitchToSingle = useCallback(() => {
    batch(() => {
      const first = variants.value[0];
      if (first) {
        priceDollars.value = first.priceDollars;
        quantity.value = first.quantity;
      }
      variantMode.value = 'single';
      variants.value = [];
      variantPropertiesText.value = '';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addVariant = useCallback(() => {
    variants.value = [
      ...variants.value,
      emptyVariantRow(`Variant ${variants.value.length + 1}`),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeVariant = useCallback((index: number) => {
    if (variants.value.length <= 1) return;
    variants.value = variants.value.filter((_, i) => i !== index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateVariant = useCallback(
    (index: number, patch: Partial<VariantRow>) => {
      variants.value = variants.value.map((row, i) =>
        i === index ? { ...row, ...patch } : row
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
        status: status.value,
      };

      if (variantMode.value === 'multi') {
        input.variants = variants.value.map(rowToCreateInput);
        const props = parseVariantProperties(variantPropertiesText.value);
        if (props.length > 0) input.variantProperties = props;
      } else {
        input.priceCents = toCents(priceDollars.value);
        input.quantity = quantity.value;
      }

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

          {/* Variants section */}
          <Divider textAlign="left">
            <Typography variant="overline" color="text.secondary">
              {variantMode.value === 'multi'
                ? 'Variants'
                : 'Price & Inventory'}
            </Typography>
          </Divider>

          {variantMode.value === 'single' ? (
            <>
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

              <Button
                size="small"
                variant="text"
                onClick={handleSwitchToMulti}
                sx={{ alignSelf: 'flex-start' }}
              >
                Use multiple variants (size, color, …)
              </Button>
            </>
          ) : (
            <>
              <TextField
                label="Variant property"
                placeholder="e.g. Size, Color"
                value={variantPropertiesText.value}
                onChange={(e) => (variantPropertiesText.value = e.target.value)}
                helperText="What do these variants represent? Comma-separate if more than one."
                fullWidth
              />

              <Stack spacing={1}>
                {variants.value.map((row, index) => {
                  const variantError = getFieldError('variants');
                  return (
                    <Stack
                      key={index}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                    >
                      <TextField
                        label="Label"
                        value={row.label}
                        onChange={(e) =>
                          updateVariant(index, { label: e.target.value })
                        }
                        size="small"
                        sx={{ flex: 1 }}
                        required
                      />
                      <TextField
                        label="Price"
                        type="number"
                        value={row.priceDollars}
                        onChange={(e) =>
                          updateVariant(index, {
                            priceDollars: parseFloat(e.target.value) || 0,
                          })
                        }
                        size="small"
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">$</InputAdornment>
                          ),
                        }}
                        inputProps={{ step: 0.01, min: 0 }}
                        sx={{ width: { xs: '100%', sm: 130 } }}
                        required
                      />
                      <TextField
                        label="Qty"
                        type="number"
                        value={row.quantity}
                        onChange={(e) =>
                          updateVariant(index, {
                            quantity: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        size="small"
                        inputProps={{ min: 0 }}
                        sx={{ width: { xs: '100%', sm: 90 } }}
                        required
                      />
                      <TextField
                        label="SKU"
                        value={row.sku}
                        onChange={(e) =>
                          updateVariant(index, { sku: e.target.value })
                        }
                        size="small"
                        placeholder="auto"
                        sx={{ width: { xs: '100%', sm: 130 } }}
                      />
                      <Tooltip
                        title={
                          variants.value.length <= 1
                            ? 'At least one variant required'
                            : 'Remove variant'
                        }
                      >
                        <span>
                          <IconButton
                            aria-label={`Remove variant ${index + 1}`}
                            onClick={() => removeVariant(index)}
                            disabled={variants.value.length <= 1}
                            size="small"
                            sx={{ alignSelf: { sm: 'center' } }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {showValidationErrors.value && variantError && index === 0 && (
                        <FormHelperText error sx={{ mx: 0, width: '100%' }}>
                          {variantError}
                        </FormHelperText>
                      )}
                    </Stack>
                  );
                })}
              </Stack>

              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={addVariant}
                >
                  Add variant
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={handleSwitchToSingle}
                >
                  Use a single price/qty instead
                </Button>
              </Stack>
            </>
          )}

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

          {/* Etsy push controls — edit mode only, since it needs a saved product */}
          {isEdit && product && <ProductEtsySection product={product} />}
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
