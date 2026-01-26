'use client';

/**
 * ClassForm - Class/Workshop Form using Preact Signals
 */

import { useCallback, useEffect } from 'react';
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
  Alert,
  InputAdornment,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Class,
  CreateClassInput,
  ClassStatus,
  ClassSkillLevel,
  Instructor,
  ClassCategory,
} from '@maple/ts/domain';
import type {
  UploadClassImageRequest,
  UploadClassImageResponse,
} from '@maple/ts/firebase/api-types';
import { ImageUpload, type ImageUploadState } from '@maple/react/ui';
import { classValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

interface ClassFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateClassInput) => Promise<void>;
  classItem?: Class;
  instructors?: Instructor[];
  categories?: ClassCategory[];
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

export function ClassForm({
  open,
  onClose,
  onSubmit,
  classItem,
  instructors = [],
  categories = [],
  isSubmitting = false,
}: ClassFormProps) {
  useSignals();

  // ============================================================
  // FORM FIELD SIGNALS
  // ============================================================
  const name = useSignal('');
  const description = useSignal('');
  const shortDescription = useSignal('');
  const instructorId = useSignal('');
  const dateTime = useSignal<Date>(new Date());
  const durationMinutes = useSignal(60);
  const capacity = useSignal(10);
  const priceCents = useSignal(0);
  const imageUrl = useSignal('');
  const categoryId = useSignal('');
  const skillLevel = useSignal<ClassSkillLevel>('all-levels');
  const status = useSignal<ClassStatus>('draft');
  const location = useSignal('');
  const materialsIncluded = useSignal('');
  const whatToBring = useSignal('');
  const minimumAge = useSignal<number | undefined>(undefined);

  // ============================================================
  // UI STATE SIGNALS
  // ============================================================
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);
  const imageUploadState = useSignal<ImageUploadState>({ status: 'idle' });
  const pendingImageFile = useSignal<File | null>(null);

  const isEdit = !!classItem;

  // ============================================================
  // VALIDATION
  // ============================================================

  const validation = useComputed(() => {
    return classValidation({
      name: name.value,
      description: description.value,
      shortDescription: shortDescription.value || undefined,
      instructorId: instructorId.value || undefined,
      dateTime: dateTime.value,
      durationMinutes: durationMinutes.value,
      capacity: capacity.value,
      priceCents: priceCents.value,
      categoryId: categoryId.value || undefined,
      skillLevel: skillLevel.value,
      status: status.value,
      location: location.value || undefined,
      materialsIncluded: materialsIncluded.value || undefined,
      whatToBring: whatToBring.value || undefined,
      minimumAge: minimumAge.value,
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

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    if (!open) return;

    if (classItem) {
      batch(() => {
        name.value = classItem.name;
        description.value = classItem.description;
        shortDescription.value = classItem.shortDescription ?? '';
        instructorId.value = classItem.instructorId ?? '';
        dateTime.value =
          classItem.dateTime instanceof Date
            ? classItem.dateTime
            : new Date(classItem.dateTime);
        durationMinutes.value = classItem.durationMinutes;
        capacity.value = classItem.capacity;
        priceCents.value = classItem.priceCents;
        imageUrl.value = classItem.imageUrl ?? '';
        categoryId.value = classItem.categoryId ?? '';
        skillLevel.value = classItem.skillLevel;
        status.value = classItem.status;
        location.value = classItem.location ?? '';
        materialsIncluded.value = classItem.materialsIncluded ?? '';
        whatToBring.value = classItem.whatToBring ?? '';
        minimumAge.value = classItem.minimumAge;

        if (classItem.imageUrl) {
          imageUploadState.value = {
            status: 'success',
            url: classItem.imageUrl,
          };
        } else {
          imageUploadState.value = { status: 'idle' };
        }

        pendingImageFile.value = null;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      // Defaults for new class
      const defaultDateTime = new Date();
      defaultDateTime.setHours(defaultDateTime.getHours() + 24); // Tomorrow
      defaultDateTime.setMinutes(0, 0, 0);

      batch(() => {
        name.value = '';
        description.value = '';
        shortDescription.value = '';
        instructorId.value = '';
        dateTime.value = defaultDateTime;
        durationMinutes.value = 120;
        capacity.value = 10;
        priceCents.value = 4500; // $45 default
        imageUrl.value = '';
        categoryId.value = '';
        skillLevel.value = 'all-levels';
        status.value = 'draft';
        location.value = '';
        materialsIncluded.value = '';
        whatToBring.value = '';
        minimumAge.value = undefined;
        imageUploadState.value = { status: 'idle' };
        pendingImageFile.value = null;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classItem]);

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleImageSelected = useCallback((file: File, previewUrl: string) => {
    pendingImageFile.value = file;
    imageUploadState.value = { status: 'previewing', previewUrl, file };
  }, []);

  const handleImageRemove = useCallback(() => {
    pendingImageFile.value = null;
    imageUploadState.value = { status: 'removed' };
    imageUrl.value = '';
  }, []);

  const uploadImage = async (
    file: File,
    classId?: string
  ): Promise<string> => {
    const functions = getMapleFunctions();
    const upload = httpsCallable<
      UploadClassImageRequest,
      UploadClassImageResponse
    >(functions, 'uploadClassImage');

    const imageBase64 = await readFileAsBase64(file);

    const result = await upload({
      classId,
      imageBase64,
      contentType: file.type,
    });

    if (!result.data.success) {
      throw new Error('Image upload failed');
    }

    return result.data.url;
  };

  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;

    if (!isValid.value) {
      return;
    }

    submitError.value = null;

    try {
      let currentImageUrl = imageUrl.value;

      // If there's a pending image to upload
      if (pendingImageFile.value) {
        const currentPreviewUrl =
          imageUploadState.value.status === 'previewing'
            ? imageUploadState.value.previewUrl
            : '';

        imageUploadState.value = {
          status: 'uploading',
          previewUrl: currentPreviewUrl,
        };

        try {
          currentImageUrl = await uploadImage(
            pendingImageFile.value,
            classItem?.id
          );
          imageUploadState.value = { status: 'success', url: currentImageUrl };
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

      const input: CreateClassInput = {
        name: name.value,
        description: description.value,
        shortDescription: shortDescription.value || undefined,
        instructorId: instructorId.value || undefined,
        dateTime: dateTime.value,
        durationMinutes: durationMinutes.value,
        capacity: capacity.value,
        priceCents: priceCents.value,
        imageUrl: currentImageUrl || undefined,
        categoryId: categoryId.value || undefined,
        skillLevel: skillLevel.value,
        status: status.value,
        location: location.value || undefined,
        materialsIncluded: materialsIncluded.value || undefined,
        whatToBring: whatToBring.value || undefined,
        minimumAge: minimumAge.value,
      };

      await onSubmit(input);
      onClose();
    } catch (error: unknown) {
      let message = 'Failed to save class';
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
  }, [onSubmit, onClose, classItem?.id]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>{isEdit ? 'Edit Class' : 'Add Class'}</DialogTitle>
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
              existingImageUrl={classItem?.imageUrl}
              label="Class Image"
            />

            {/* Row 1: Name and Status */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Class Name"
                value={name.value}
                onChange={(e) => (name.value = e.target.value)}
                error={!!getFieldError('name')}
                helperText={getFieldError('name')}
                required
                fullWidth
              />
              <FormControl sx={{ minWidth: 140 }} error={!!getFieldError('status')}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={status.value}
                  label="Status"
                  onChange={(e) => (status.value = e.target.value as ClassStatus)}
                >
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="published">Published</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Short Description */}
            <TextField
              label="Short Description"
              value={shortDescription.value}
              onChange={(e) => (shortDescription.value = e.target.value)}
              error={!!getFieldError('shortDescription')}
              helperText={getFieldError('shortDescription') || 'Brief tagline for listings (max 160 chars)'}
              inputProps={{ maxLength: 160 }}
              fullWidth
            />

            {/* Full Description */}
            <TextField
              label="Full Description"
              value={description.value}
              onChange={(e) => (description.value = e.target.value)}
              error={!!getFieldError('description')}
              helperText={getFieldError('description') || 'Detailed description for the class page'}
              multiline
              rows={4}
              required
              fullWidth
            />

            {/* Row 2: Date, Duration, Price */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <DateTimePicker
                label="Date & Time"
                value={dateTime.value}
                onChange={(newValue) => {
                  if (newValue) dateTime.value = newValue;
                }}
                slotProps={{
                  textField: {
                    error: !!getFieldError('dateTime'),
                    helperText: getFieldError('dateTime'),
                    required: true,
                    sx: { flex: 1, minWidth: 200 },
                  },
                }}
              />
              <TextField
                label="Duration"
                type="number"
                value={durationMinutes.value}
                onChange={(e) => (durationMinutes.value = parseInt(e.target.value) || 0)}
                error={!!getFieldError('durationMinutes')}
                helperText={getFieldError('durationMinutes')}
                InputProps={{
                  endAdornment: <InputAdornment position="end">min</InputAdornment>,
                }}
                sx={{ width: 130 }}
                required
              />
              <TextField
                label="Price"
                type="number"
                value={priceCents.value / 100}
                onChange={(e) => (priceCents.value = Math.round(parseFloat(e.target.value) * 100) || 0)}
                error={!!getFieldError('priceCents')}
                helperText={getFieldError('priceCents')}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                sx={{ width: 120 }}
                required
              />
            </Box>

            {/* Row 3: Capacity, Skill Level, Category */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Capacity"
                type="number"
                value={capacity.value}
                onChange={(e) => (capacity.value = parseInt(e.target.value) || 0)}
                error={!!getFieldError('capacity')}
                helperText={getFieldError('capacity') || 'Max participants'}
                sx={{ width: 120 }}
                required
              />
              <FormControl sx={{ minWidth: 140 }}>
                <InputLabel>Skill Level</InputLabel>
                <Select
                  value={skillLevel.value}
                  label="Skill Level"
                  onChange={(e) => (skillLevel.value = e.target.value as ClassSkillLevel)}
                >
                  <MenuItem value="beginner">Beginner</MenuItem>
                  <MenuItem value="intermediate">Intermediate</MenuItem>
                  <MenuItem value="advanced">Advanced</MenuItem>
                  <MenuItem value="all-levels">All Levels</MenuItem>
                </Select>
              </FormControl>
              {categories.length > 0 && (
                <FormControl sx={{ minWidth: 160 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={categoryId.value}
                    label="Category"
                    onChange={(e) => (categoryId.value = e.target.value)}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {categories.map((cat) => (
                      <MenuItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>

            {/* Instructor */}
            {instructors.length > 0 && (
              <FormControl fullWidth>
                <InputLabel>Instructor</InputLabel>
                <Select
                  value={instructorId.value}
                  label="Instructor"
                  onChange={(e) => (instructorId.value = e.target.value)}
                >
                  <MenuItem value="">
                    <em>Not assigned</em>
                  </MenuItem>
                  {instructors.map((inst) => (
                    <MenuItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>Optional - assign an instructor</FormHelperText>
              </FormControl>
            )}

            {/* Location */}
            <TextField
              label="Location"
              value={location.value}
              onChange={(e) => (location.value = e.target.value)}
              helperText="Optional - defaults to store address if not specified"
              fullWidth
            />

            {/* Materials Included */}
            <TextField
              label="Materials Included"
              value={materialsIncluded.value}
              onChange={(e) => (materialsIncluded.value = e.target.value)}
              helperText="What materials are included in the price"
              multiline
              rows={2}
              fullWidth
            />

            {/* What to Bring */}
            <TextField
              label="What to Bring"
              value={whatToBring.value}
              onChange={(e) => (whatToBring.value = e.target.value)}
              helperText="What students should bring"
              multiline
              rows={2}
              fullWidth
            />

            {/* Minimum Age */}
            <TextField
              label="Minimum Age"
              type="number"
              value={minimumAge.value ?? ''}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                minimumAge.value = isNaN(val) ? undefined : val;
              }}
              helperText="Optional age requirement (leave blank for no minimum)"
              sx={{ width: 160 }}
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
    </LocalizationProvider>
  );
}
