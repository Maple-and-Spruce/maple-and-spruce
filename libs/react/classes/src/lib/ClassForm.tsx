'use client';

/**
 * ClassForm - Class/Workshop Form using Preact Signals
 *
 * Supports multi-session classes: a calendar multi-select for picking dates,
 * with either one shared time or per-date unique times.
 */

import { useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  InputAdornment,
  Switch,
  Typography,
} from '@mui/material';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay, type PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Class,
  CreateClassInput,
  ClassSession,
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
  /** Override the default date/time for new classes (useful for deterministic snapshots). */
  defaultDateTime?: Date;
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

/**
 * Normalise a Date to a YYYY-MM-DD string for use as a Map key.
 */
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Check whether two dates share the same calendar day.
 */
function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

// ---------------------------------------------------------------------------
// Custom PickersDay that visually highlights selected dates
// ---------------------------------------------------------------------------
function MultiSelectDay(
  props: PickersDayProps<Date> & { selectedDates: Date[] }
) {
  const { selectedDates, day, ...rest } = props;
  const isSelected = selectedDates.some((d) => isSameDay(d, day));

  return (
    <PickersDay
      {...rest}
      day={day}
      selected={isSelected}
      sx={{
        ...(isSelected && {
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          '&:hover': { backgroundColor: 'primary.dark' },
          '&.Mui-selected': {
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
          },
        }),
      }}
    />
  );
}

export function ClassForm({
  open,
  onClose,
  onSubmit,
  classItem,
  instructors = [],
  categories = [],
  isSubmitting = false,
  defaultDateTime,
}: ClassFormProps) {
  useSignals();

  // ============================================================
  // FORM FIELD SIGNALS
  // ============================================================
  const name = useSignal('');
  const description = useSignal('');
  const shortDescription = useSignal('');
  const instructorId = useSignal('');

  // Multi-date selection
  const selectedDates = useSignal<Date[]>([]);
  // Shared time (hour/min) — only used when useDifferentTimes is false
  const sharedTime = useSignal<Date | null>(null);
  // Per-date times — only used when useDifferentTimes is true
  const perDateTimes = useSignal<Map<string, Date>>(new Map());
  // Toggle between shared/per-date time mode
  const useDifferentTimes = useSignal(false);

  // Registration cutoff override
  const registrationClosesAt = useSignal<Date | null>(null);

  const durationMinutes = useSignal(60);
  const capacity = useSignal(8);
  const priceCents = useSignal(0);
  const priceDisplay = useSignal('0.00');
  const imageUrl = useSignal('');
  const categoryId = useSignal('');
  const skillLevel = useSignal<ClassSkillLevel>('all-levels');
  const status = useSignal<ClassStatus>('draft');
  const location = useSignal('Maple & Spruce');
  const durationMode = useSignal<'preset' | 'custom'>('preset');
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
  // COMPOSE SESSIONS from date+time signals
  // ============================================================
  const composedSessions = useComputed<ClassSession[]>(() => {
    const dates = [...selectedDates.value].sort(
      (a, b) => a.getTime() - b.getTime()
    );
    if (dates.length === 0) return [];

    return dates.map((d) => {
      let timeSource: Date | null;
      if (useDifferentTimes.value) {
        timeSource = perDateTimes.value.get(toDateKey(d)) ?? sharedTime.value;
      } else {
        timeSource = sharedTime.value;
      }

      const dt = new Date(d);
      if (timeSource) {
        dt.setHours(timeSource.getHours(), timeSource.getMinutes(), 0, 0);
      } else {
        dt.setHours(12, 0, 0, 0); // default noon
      }
      return { dateTime: dt };
    });
  });

  // ============================================================
  // VALIDATION
  // ============================================================

  const validation = useComputed(() => {
    return classValidation({
      name: name.value,
      description: description.value,
      shortDescription: shortDescription.value || undefined,
      instructorId: instructorId.value || undefined,
      sessions: composedSessions.value,
      registrationClosesAt: registrationClosesAt.value ?? undefined,
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

  const fieldLabels: Record<string, string> = {
    name: 'Class Name',
    description: 'Full Description',
    shortDescription: 'Short Description',
    instructorId: 'Instructor',
    sessions: 'Class Dates',
    registrationClosesAt: 'Registration Close',
    durationMinutes: 'Duration',
    capacity: 'Capacity',
    priceCents: 'Price',
    skillLevel: 'Skill Level',
    status: 'Status',
    minimumAge: 'Minimum Age',
    materialsIncluded: 'Materials Included',
    whatToBring: 'What to Bring',
  };

  const hasValidationErrors = useComputed(() => {
    return showValidationErrors.value && Object.keys(errors.value).length > 0;
  });

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    if (!open) return;

    if (classItem) {
      // Edit mode — populate from existing class
      const dates = classItem.sessions.map((s) =>
        s.dateTime instanceof Date ? s.dateTime : new Date(s.dateTime)
      );

      // Detect shared vs different times
      const times = dates.map((d) => `${d.getHours()}:${d.getMinutes()}`);
      const allSame = times.every((t) => t === times[0]);

      const defaultShared = dates[0] ?? new Date();

      const perDateMap = new Map<string, Date>();
      if (!allSame) {
        for (const d of dates) {
          perDateMap.set(toDateKey(d), d);
        }
      }

      batch(() => {
        name.value = classItem.name;
        description.value = classItem.description;
        shortDescription.value = classItem.shortDescription ?? '';
        instructorId.value = classItem.instructorId ?? '';
        selectedDates.value = dates;
        sharedTime.value = defaultShared;
        perDateTimes.value = perDateMap;
        useDifferentTimes.value = !allSame;
        registrationClosesAt.value = classItem.registrationClosesAt
          ? classItem.registrationClosesAt instanceof Date
            ? classItem.registrationClosesAt
            : new Date(classItem.registrationClosesAt)
          : null;
        durationMinutes.value = classItem.durationMinutes;
        capacity.value = classItem.capacity;
        priceCents.value = classItem.priceCents;
        priceDisplay.value = (classItem.priceCents / 100).toFixed(2);
        imageUrl.value = classItem.imageUrl ?? '';
        categoryId.value = classItem.categoryId ?? '';
        skillLevel.value = classItem.skillLevel;
        status.value = classItem.status;
        location.value = classItem.location ?? '';
        durationMode.value = [60, 90, 120, 150, 180].includes(classItem.durationMinutes) ? 'preset' : 'custom';
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
      let newClassDateTime: Date;
      if (defaultDateTime) {
        newClassDateTime = defaultDateTime;
      } else {
        newClassDateTime = new Date();
        newClassDateTime.setHours(newClassDateTime.getHours() + 24);
        newClassDateTime.setMinutes(0, 0, 0);
      }

      batch(() => {
        name.value = '';
        description.value = '';
        shortDescription.value = '';
        instructorId.value = '';
        selectedDates.value = [];
        sharedTime.value = newClassDateTime;
        perDateTimes.value = new Map();
        useDifferentTimes.value = false;
        registrationClosesAt.value = null;
        durationMinutes.value = 120;
        durationMode.value = 'preset';
        capacity.value = 8;
        priceCents.value = 4500;
        priceDisplay.value = '45.00';
        imageUrl.value = '';
        categoryId.value = '';
        skillLevel.value = 'all-levels';
        status.value = 'draft';
        location.value = 'Maple & Spruce';
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
  // DATE HANDLERS
  // ============================================================

  const handleDateClick = useCallback((day: Date | null) => {
    if (!day) return;
    const key = toDateKey(day);
    const existing = selectedDates.value;
    const alreadySelected = existing.some((d) => toDateKey(d) === key);

    if (alreadySelected) {
      // Remove date
      selectedDates.value = existing.filter((d) => toDateKey(d) !== key);
      // Also remove per-date time entry
      const newMap = new Map(perDateTimes.value);
      newMap.delete(key);
      perDateTimes.value = newMap;
    } else {
      selectedDates.value = [...existing, day];
    }
  }, []);

  const removeDate = useCallback((day: Date) => {
    const key = toDateKey(day);
    selectedDates.value = selectedDates.value.filter(
      (d) => toDateKey(d) !== key
    );
    const newMap = new Map(perDateTimes.value);
    newMap.delete(key);
    perDateTimes.value = newMap;
  }, []);

  // ============================================================
  // IMAGE HANDLERS
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

  // ============================================================
  // SUBMIT
  // ============================================================

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
        sessions: composedSessions.value,
        registrationClosesAt: registrationClosesAt.value ?? undefined,
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

  // Sorted selected dates for display
  const sortedDates = useMemo(
    () => [...selectedDates.value].sort((a, b) => a.getTime() - b.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDates.value]
  );

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

            {hasValidationErrors.value && (
              <Alert severity="error">
                Please fix the following errors:
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {Object.entries(errors.value).map(([field, messages]) => (
                    <li key={field}>
                      <strong>{fieldLabels[field] ?? field}</strong>: {messages[0]}
                    </li>
                  ))}
                </ul>
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
                <InputLabel id="class-status-label">Status</InputLabel>
                <Select
                  labelId="class-status-label"
                  id="class-status-select"
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

            {/* ============================================================ */}
            {/* MULTI-DATE PICKER SECTION                                    */}
            {/* ============================================================ */}
            <Box
              sx={{
                border: 1,
                borderColor: getFieldError('sessions') ? 'error.main' : 'divider',
                borderRadius: 1,
                p: 2,
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Class Dates *
              </Typography>

              {/* Calendar */}
              <DateCalendar
                disablePast
                onChange={handleDateClick}
                slots={{
                  day: (props) => (
                    <MultiSelectDay
                      {...props}
                      selectedDates={selectedDates.value}
                    />
                  ),
                }}
              />

              {/* Selected date chips */}
              {sortedDates.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {sortedDates.map((d) => (
                    <Chip
                      key={toDateKey(d)}
                      label={d.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      onDelete={() => removeDate(d)}
                      size="small"
                    />
                  ))}
                </Box>
              )}

              {getFieldError('sessions') && (
                <FormHelperText error>
                  {getFieldError('sessions')}
                </FormHelperText>
              )}

              {/* Time controls */}
              {sortedDates.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {sortedDates.length > 1 && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={useDifferentTimes.value}
                          onChange={(e) =>
                            (useDifferentTimes.value = e.target.checked)
                          }
                          size="small"
                        />
                      }
                      label="Use different times for each date"
                      sx={{ mb: 1 }}
                    />
                  )}

                  {!useDifferentTimes.value ? (
                    <TimePicker
                      label="Time (all dates)"
                      value={sharedTime.value}
                      onChange={(v) => (sharedTime.value = v)}
                      slotProps={{
                        textField: {
                          size: 'small',
                          sx: { width: 180 },
                        },
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      {sortedDates.map((d) => {
                        const key = toDateKey(d);
                        return (
                          <Box
                            key={key}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <Typography variant="body2" sx={{ minWidth: 110 }}>
                              {d.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </Typography>
                            <TimePicker
                              value={
                                perDateTimes.value.get(key) ??
                                sharedTime.value
                              }
                              onChange={(v) => {
                                if (v) {
                                  const newMap = new Map(perDateTimes.value);
                                  newMap.set(key, v);
                                  perDateTimes.value = newMap;
                                }
                              }}
                              slotProps={{
                                textField: {
                                  size: 'small',
                                  sx: { width: 160 },
                                },
                              }}
                            />
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            {/* Registration Close (optional) */}
            <DateTimePicker
              label="Registration closes (optional)"
              value={registrationClosesAt.value}
              onChange={(v) => (registrationClosesAt.value = v)}
              slotProps={{
                textField: {
                  error: !!getFieldError('registrationClosesAt'),
                  helperText:
                    getFieldError('registrationClosesAt') ||
                    'Defaults to first session start if not set',
                  sx: { width: 280 },
                },
              }}
            />

            {/* Row: Duration, Price */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl sx={{ minWidth: 160 }} error={!!getFieldError('durationMinutes')} required>
                <InputLabel id="duration-label">Duration</InputLabel>
                <Select
                  labelId="duration-label"
                  id="duration-select"
                  value={durationMode.value === 'custom' ? 'custom' : String(durationMinutes.value)}
                  label="Duration"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      durationMode.value = 'custom';
                    } else {
                      durationMode.value = 'preset';
                      durationMinutes.value = parseInt(val);
                    }
                  }}
                >
                  <MenuItem value="15">0.25 hours</MenuItem>
                  <MenuItem value="30">0.5 hours</MenuItem>
                  <MenuItem value="45">0.75 hours</MenuItem>
                  <MenuItem value="60">1 hour</MenuItem>
                  <MenuItem value="75">1.25 hours</MenuItem>
                  <MenuItem value="90">1.5 hours</MenuItem>
                  <MenuItem value="105">1.75 hours</MenuItem>
                  <MenuItem value="120">2 hours</MenuItem>
                  <MenuItem value="135">2.25 hours</MenuItem>
                  <MenuItem value="150">2.5 hours</MenuItem>
                  <MenuItem value="165">2.75 hours</MenuItem>
                  <MenuItem value="180">3 hours</MenuItem>
                  <MenuItem value="195">3.25 hours</MenuItem>
                  <MenuItem value="210">3.5 hours</MenuItem>
                  <MenuItem value="225">3.75 hours</MenuItem>
                  <MenuItem value="240">4 hours</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
                {getFieldError('durationMinutes') && (
                  <FormHelperText>{getFieldError('durationMinutes')}</FormHelperText>
                )}
              </FormControl>
              {durationMode.value === 'custom' && (
                <TextField
                  label="Minutes"
                  type="number"
                  value={durationMinutes.value}
                  onChange={(e) => (durationMinutes.value = parseInt(e.target.value) || 0)}
                  error={!!getFieldError('durationMinutes')}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">min</InputAdornment>,
                  }}
                  sx={{ width: 130 }}
                />
              )}
              <TextField
                label="Price"
                value={priceDisplay.value}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (/^\d*\.?\d{0,2}$/.test(raw) || raw === '') {
                    priceDisplay.value = raw;
                    const cents = Math.round(parseFloat(raw || '0') * 100);
                    priceCents.value = isNaN(cents) ? 0 : cents;
                  }
                }}
                onBlur={() => {
                  const val = parseFloat(priceDisplay.value || '0');
                  priceDisplay.value = (isNaN(val) ? 0 : val).toFixed(2);
                }}
                error={!!getFieldError('priceCents')}
                helperText={getFieldError('priceCents')}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                sx={{ width: 120 }}
                required
              />
            </Box>

            {/* Row: Capacity, Skill Level, Category */}
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
                <InputLabel id="skill-level-label">Skill Level</InputLabel>
                <Select
                  labelId="skill-level-label"
                  id="skill-level-select"
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
                  <InputLabel id="category-label">Category</InputLabel>
                  <Select
                    labelId="category-label"
                    id="category-select"
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
            {(instructors.length > 0 || !!getFieldError('instructorId')) && (
              <FormControl fullWidth error={!!getFieldError('instructorId')}>
                <InputLabel id="instructor-label">Instructor</InputLabel>
                <Select
                  labelId="instructor-label"
                  id="instructor-select"
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
                <FormHelperText>
                  {getFieldError('instructorId') || 'Optional - assign an instructor'}
                </FormHelperText>
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
