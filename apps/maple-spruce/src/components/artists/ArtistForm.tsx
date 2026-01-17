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
import { ImageUpload, type ImageUploadState } from '../common';

interface ArtistFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateArtistInput) => Promise<void>;
  artist?: Artist;
  isSubmitting?: boolean;
}

const defaultFormData: CreateArtistInput = {
  name: '',
  email: '',
  phone: '',
  defaultCommissionRate: 0.4, // 40% to store, 60% to artist
  status: 'active',
  notes: '',
  photoUrl: '',
};

/**
 * Basic client-side validation
 * Full validation happens on the server with vest
 */
function validateForm(data: CreateArtistInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.name?.trim()) {
    errors.name = 'Name is required';
  } else if (data.name.length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }

  if (!data.email?.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Email must be valid';
  }

  if (data.phone && !/^[\d\s\-+()]+$/.test(data.phone)) {
    errors.phone = 'Phone must be valid';
  }

  if (
    data.defaultCommissionRate === undefined ||
    data.defaultCommissionRate === null
  ) {
    errors.defaultCommissionRate = 'Commission rate is required';
  } else if (data.defaultCommissionRate < 0 || data.defaultCommissionRate > 1) {
    errors.defaultCommissionRate = 'Commission rate must be between 0% and 100%';
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

export function ArtistForm({
  open,
  onClose,
  onSubmit,
  artist,
  isSubmitting = false,
}: ArtistFormProps) {
  const [formData, setFormData] = useState<CreateArtistInput>(defaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Image upload state
  const [imageUploadState, setImageUploadState] = useState<ImageUploadState>({
    status: 'idle',
  });
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);

  const isEdit = !!artist;

  useEffect(() => {
    if (artist) {
      setFormData({
        name: artist.name,
        email: artist.email,
        phone: artist.phone ?? '',
        defaultCommissionRate: artist.defaultCommissionRate,
        status: artist.status,
        notes: artist.notes ?? '',
        photoUrl: artist.photoUrl ?? '',
      });
      // If artist has an existing photo, show it as success state
      if (artist.photoUrl) {
        setImageUploadState({ status: 'success', url: artist.photoUrl });
      } else {
        setImageUploadState({ status: 'idle' });
      }
    } else {
      setFormData(defaultFormData);
      setImageUploadState({ status: 'idle' });
    }
    setPendingImageFile(null);
    setErrors({});
    setSubmitError(null);
  }, [artist, open]);

  const handleChange = (
    field: keyof CreateArtistInput,
    value: string | number | ArtistStatus
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

  const handleImageSelected = useCallback((file: File, previewUrl: string) => {
    setPendingImageFile(file);
    setImageUploadState({ status: 'previewing', previewUrl, file });
  }, []);

  const handleImageRemove = useCallback(() => {
    setPendingImageFile(null);
    setImageUploadState({ status: 'idle' });
    setFormData((prev) => ({ ...prev, photoUrl: '' }));
  }, []);

  /**
   * Upload image to Firebase Storage
   */
  const uploadImage = async (file: File, artistId?: string): Promise<string> => {
    const functions = getMapleFunctions();
    const upload = httpsCallable<UploadArtistImageRequest, UploadArtistImageResponse>(
      functions,
      'uploadArtistImage'
    );

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
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitError(null);

    try {
      let photoUrl = formData.photoUrl;

      // If there's a pending image to upload, upload it first
      if (pendingImageFile) {
        setImageUploadState({
          status: 'uploading',
          previewUrl:
            imageUploadState.status === 'previewing'
              ? imageUploadState.previewUrl
              : '',
        });

        try {
          photoUrl = await uploadImage(pendingImageFile, artist?.id);
          setImageUploadState({ status: 'success', url: photoUrl });
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

      // Submit with the (possibly updated) photoUrl
      await onSubmit({ ...formData, photoUrl });
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to save artist'
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Artist' : 'Add Artist'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          {/* Image Upload */}
          <ImageUpload
            state={imageUploadState}
            onFileSelected={handleImageSelected}
            onRemove={handleImageRemove}
            existingImageUrl={artist?.photoUrl}
            label="Artist Photo"
          />

          <TextField
            label="Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={!!errors.name}
            helperText={errors.name}
            required
            fullWidth
          />

          <TextField
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            error={!!errors.email}
            helperText={errors.email}
            required
            fullWidth
          />

          <TextField
            label="Phone"
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            error={!!errors.phone}
            helperText={errors.phone || 'Optional'}
            fullWidth
          />

          <TextField
            label="Commission Rate (to store)"
            type="number"
            value={Math.round(formData.defaultCommissionRate * 100)}
            onChange={(e) =>
              handleChange(
                'defaultCommissionRate',
                (parseFloat(e.target.value) || 0) / 100
              )
            }
            error={!!errors.defaultCommissionRate}
            helperText={
              errors.defaultCommissionRate ||
              `Store keeps ${Math.round(formData.defaultCommissionRate * 100)}%, artist gets ${Math.round((1 - formData.defaultCommissionRate) * 100)}%`
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
              inputProps: { min: 0, max: 100 },
            }}
            required
            fullWidth
          />

          <FormControl fullWidth error={!!errors.status}>
            <InputLabel>Status</InputLabel>
            <Select
              value={formData.status}
              label="Status"
              onChange={(e) =>
                handleChange('status', e.target.value as ArtistStatus)
              }
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Notes"
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            multiline
            rows={3}
            helperText="Optional internal notes about this artist"
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
