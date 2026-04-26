'use client';

import { useCallback, useEffect } from 'react';
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
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  ClassCategory,
  CreateClassCategoryInput,
  GalleryImage,
} from '@maple/ts/domain';
import type {
  UploadCategoryGalleryImageRequest,
  UploadCategoryGalleryImageResponse,
} from '@maple/ts/firebase/api-types';
import { classCategoryValidation } from '@maple/ts/validation';
import { GalleryEditor } from '@maple/react/ui';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface ClassCategoryFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateClassCategoryInput) => Promise<void>;
  category?: ClassCategory;
  isSubmitting?: boolean;
  nextOrder?: number;
}

export function ClassCategoryForm({
  open,
  onClose,
  onSubmit,
  category,
  isSubmitting = false,
  nextOrder = 0,
}: ClassCategoryFormProps) {
  useSignals();

  const name = useSignal('');
  const description = useSignal('');
  const galleryImages = useSignal<GalleryImage[]>([]);

  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const isEdit = !!category;

  const validation = useComputed(() => {
    return classCategoryValidation({
      name: name.value,
      description: description.value || undefined,
      order: isEdit ? category.order : nextOrder,
      galleryImages:
        galleryImages.value.length > 0 ? galleryImages.value : undefined,
    });
  });

  const errors = useComputed<Record<string, string[]>>(() => {
    if (!showValidationErrors.value) return {};
    return validation.value.getErrors();
  });

  const isValid = useComputed(() => validation.value.isValid());

  const getFieldError = (field: string): string | null => {
    const fieldErrors = errors.value[field];
    return fieldErrors?.[0] ?? null;
  };

  const uploadGalleryImage = useCallback(
    async (file: File): Promise<string> => {
      const functions = getMapleFunctions();
      const upload = httpsCallable<
        UploadCategoryGalleryImageRequest,
        UploadCategoryGalleryImageResponse
      >(functions, 'uploadCategoryGalleryImage');

      const imageBase64 = await readFileAsBase64(file);

      const result = await upload({
        categoryId: category?.id,
        imageBase64,
        contentType: file.type,
      });

      if (!result.data.success) {
        throw new Error('Pool image upload failed');
      }

      return result.data.url;
    },
    [category?.id]
  );

  useEffect(() => {
    if (!open) return;

    if (category) {
      batch(() => {
        name.value = category.name;
        description.value = category.description ?? '';
        galleryImages.value = category.galleryImages
          ? category.galleryImages.map((img) => ({ ...img }))
          : [];
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      batch(() => {
        name.value = '';
        description.value = '';
        galleryImages.value = [];
        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  const handleSubmit = async () => {
    showValidationErrors.value = true;

    if (!isValid.value) {
      return;
    }

    submitError.value = null;

    try {
      const input: CreateClassCategoryInput = {
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        order: isEdit ? category.order : nextOrder,
        galleryImages:
          galleryImages.value.length > 0
            ? galleryImages.value.map((img) => ({
                url: img.url,
                alt: img.alt.trim(),
              }))
            : undefined,
      };

      await onSubmit(input);
      onClose();
    } catch (error: unknown) {
      let message = 'Failed to save class category';
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEdit ? 'Edit Class Category' : 'Add Class Category'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          <TextField
            label="Category Name"
            value={name.value}
            onChange={(e) => (name.value = e.target.value)}
            error={!!getFieldError('name')}
            helperText={getFieldError('name')}
            placeholder="e.g., Fiber Arts"
            required
            fullWidth
            autoFocus
          />

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

          <GalleryEditor
            label="Image pool (shared across classes in this category)"
            value={galleryImages.value}
            onChange={(next) => (galleryImages.value = next)}
            onUploadFile={uploadGalleryImage}
            error={getFieldError('galleryImages') ?? undefined}
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
