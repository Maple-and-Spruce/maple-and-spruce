'use client';

/**
 * ArtistForm - Artist Form using Preact Signals
 *
 * Uses Preact Signals for state management which provides:
 * 1. Automatic validation via Vest - no manual error clearing
 * 2. Fine-grained reactivity - each field updates independently
 * 3. Cleaner code - direct signal assignments instead of handleChange
 * 4. Always-current derived state - validation auto-updates
 */

import { useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
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
import type { Artist, CreateArtistInput, ArtistStatus } from '@maple/ts/domain';
import type {
  UploadArtistImageRequest,
  UploadArtistImageResponse,
} from '@maple/ts/firebase/api-types';
import { ImageUpload, type ImageUploadState } from '@maple/react/ui';
import { artistValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

interface ArtistFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateArtistInput) => Promise<void>;
  artist?: Artist;
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

export function ArtistForm({
  open,
  onClose,
  onSubmit,
  artist,
  isSubmitting = false,
}: ArtistFormProps) {
  // Enable signals tracking in this component
  useSignals();

  // ============================================================
  // FORM FIELD SIGNALS
  // Each field is its own signal - enables fine-grained updates
  // ============================================================
  const name = useSignal('');
  const email = useSignal('');
  const phone = useSignal('');
  const defaultCommissionRate = useSignal(0.4); // 40% to store
  const status = useSignal<ArtistStatus>('active');
  const notes = useSignal('');
  const photoUrl = useSignal('');
  const preventAutoPublish = useSignal(false);

  // ============================================================
  // UI STATE SIGNALS
  // ============================================================
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);
  const imageUploadState = useSignal<ImageUploadState>({ status: 'idle' });
  const pendingImageFile = useSignal<File | null>(null);

  const isEdit = !!artist;

  // ============================================================
  // VALIDATION - Computed signals that auto-track dependencies
  // ============================================================

  // Validation runs automatically when ANY form field changes
  const validation = useComputed(() => {
    return artistValidation({
      name: name.value,
      email: email.value,
      phone: phone.value || undefined,
      defaultCommissionRate: defaultCommissionRate.value,
      status: status.value,
      notes: notes.value || undefined,
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
  // EFFECTS - Populate form when artist prop changes
  // NOTE: We use React's useEffect here instead of useSignalEffect because
  // useSignalEffect only tracks signal changes, not React prop changes.
  // The `open` and `artist` props are regular React props that need to be
  // tracked via the dependency array.
  // ============================================================

  useEffect(() => {
    // Only run when dialog opens
    if (!open) return;

    if (artist) {
      // Populate form from existing artist
      batch(() => {
        name.value = artist.name;
        email.value = artist.email;
        phone.value = artist.phone ?? '';
        defaultCommissionRate.value = artist.defaultCommissionRate;
        status.value = artist.status;
        notes.value = artist.notes ?? '';
        photoUrl.value = artist.photoUrl ?? '';
        preventAutoPublish.value = artist.preventAutoPublish ?? false;

        // Set image state
        if (artist.photoUrl) {
          imageUploadState.value = {
            status: 'success',
            url: artist.photoUrl,
          };
        } else {
          imageUploadState.value = { status: 'idle' };
        }

        pendingImageFile.value = null;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      // Reset to defaults for new artist
      batch(() => {
        name.value = '';
        email.value = '';
        phone.value = '';
        defaultCommissionRate.value = 0.4;
        status.value = 'active';
        notes.value = '';
        photoUrl.value = '';
        preventAutoPublish.value = false;
        imageUploadState.value = { status: 'idle' };
        pendingImageFile.value = null;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, artist]);

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
    photoUrl.value = '';
  }, []);

  /**
   * Upload image to Firebase Storage
   */
  const uploadImage = async (file: File, artistId?: string): Promise<string> => {
    const functions = getMapleFunctions();
    const upload = httpsCallable<
      UploadArtistImageRequest,
      UploadArtistImageResponse
    >(functions, 'uploadArtistImage');

    const imageBase64 = await readFileAsBase64(file);

    const result = await upload({
      artistId,
      imageBase64,
      contentType: file.type,
    });

    if (!result.data.success) {
      throw new Error('Image upload failed');
    }

    return result.data.url;
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
      let currentPhotoUrl = photoUrl.value;

      // If there's a pending image to upload, upload it first
      if (pendingImageFile.value) {
        // Capture preview URL before changing state
        const currentPreviewUrl =
          imageUploadState.value.status === 'previewing'
            ? imageUploadState.value.previewUrl
            : '';

        imageUploadState.value = {
          status: 'uploading',
          previewUrl: currentPreviewUrl,
        };

        try {
          currentPhotoUrl = await uploadImage(pendingImageFile.value, artist?.id);
          imageUploadState.value = { status: 'success', url: currentPhotoUrl };
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

      // Build the input from signal values
      const input: CreateArtistInput = {
        name: name.value,
        email: email.value,
        phone: phone.value || undefined,
        defaultCommissionRate: defaultCommissionRate.value,
        status: status.value,
        notes: notes.value || undefined,
        photoUrl: currentPhotoUrl || undefined,
        preventAutoPublish: preventAutoPublish.value,
      };

      await onSubmit(input);
      onClose();
    } catch (error: unknown) {
      let message = 'Failed to save artist';
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
      <DialogTitle>{isEdit ? 'Edit Artist' : 'Add Artist'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          {/* Image Upload */}
          <ImageUpload
            state={imageUploadState.value}
            onFileSelected={handleImageSelected}
            onRemove={handleImageRemove}
            existingImageUrl={artist?.photoUrl}
            label="Artist Photo"
          />

          {/* Name - signals update directly */}
          <TextField
            label="Name"
            value={name.value}
            onChange={(e) => (name.value = e.target.value)}
            error={!!getFieldError('name')}
            helperText={getFieldError('name')}
            required
            fullWidth
          />

          {/* Email */}
          <TextField
            label="Email"
            type="email"
            value={email.value}
            onChange={(e) => (email.value = e.target.value)}
            error={!!getFieldError('email')}
            helperText={getFieldError('email')}
            required
            fullWidth
          />

          {/* Phone */}
          <TextField
            label="Phone"
            value={phone.value}
            onChange={(e) => (phone.value = e.target.value)}
            error={!!getFieldError('phone')}
            helperText={getFieldError('phone') || 'Optional'}
            fullWidth
          />

          {/* Commission Rate */}
          <TextField
            label="Commission Rate (to store)"
            type="number"
            value={Math.round(defaultCommissionRate.value * 100)}
            onChange={(e) =>
              (defaultCommissionRate.value =
                (parseFloat(e.target.value) || 0) / 100)
            }
            error={!!getFieldError('defaultCommissionRate')}
            helperText={
              getFieldError('defaultCommissionRate') ||
              `Store keeps ${Math.round(defaultCommissionRate.value * 100)}%, artist gets ${Math.round((1 - defaultCommissionRate.value) * 100)}%`
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
              inputProps: { min: 0, max: 100 },
            }}
            required
            fullWidth
          />

          {/* Status */}
          <FormControl fullWidth error={!!getFieldError('status')}>
            <InputLabel>Status</InputLabel>
            <Select
              value={status.value}
              label="Status"
              onChange={(e) => (status.value = e.target.value as ArtistStatus)}
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
            {getFieldError('status') && (
              <FormHelperText>{getFieldError('status')}</FormHelperText>
            )}
          </FormControl>

          {/* Notes */}
          <TextField
            label="Notes"
            value={notes.value}
            onChange={(e) => (notes.value = e.target.value)}
            multiline
            rows={3}
            helperText="Optional internal notes about this artist"
            fullWidth
          />

          {/* Prevent Auto-Publish */}
          <FormControlLabel
            control={
              <Checkbox
                checked={preventAutoPublish.value}
                onChange={(e) => (preventAutoPublish.value = e.target.checked)}
              />
            }
            label="Prevent auto-publish to Webflow"
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
          disabled={isSubmitting || imageUploadState.value.status === 'uploading'}
        >
          {isSubmitting || imageUploadState.value.status === 'uploading'
            ? 'Saving...'
            : isEdit
              ? 'Update'
              : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
