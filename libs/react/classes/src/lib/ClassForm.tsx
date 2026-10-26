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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickerDay, type PickerDayProps } from '@mui/x-date-pickers/PickerDay';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Class,
  CreateClassInput,
  ClassFormat,
  ClassSession,
  ClassStatus,
  ClassSkillLevel,
  Instructor,
  ClassCategory,
  GalleryImage,
  Room,
} from '@maple/ts/domain';
import {
  ROOMS,
  buildPrivateHourSessions,
  describeMissingReadiness,
  getClassFormat,
  getSessionStartTimes,
  getRoomLabel,
  instructorReadiness,
} from '@maple/ts/domain';
import { RoomAvailability } from '@maple/react/rooms';
import type {
  UploadClassImageRequest,
  UploadClassImageResponse,
  UploadClassGalleryImageRequest,
  UploadClassGalleryImageResponse,
} from '@maple/ts/firebase/api-types';
import { GalleryEditor, ImageUpload, type ImageUploadState } from '@maple/react/ui';
import { CategoryGalleryPickerDialog } from './CategoryGalleryPickerDialog';
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
  /**
   * Number of active registrations for the class being edited. When > 0,
   * fields that customers have already paid for and built expectations
   * around (dates, times, duration, price, instructor, location) are
   * disabled and a banner explains why.
   */
  registrationCount?: number;
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
 * Warn, don't block, when the chosen instructor is a contractor who has not
 * been cleared to teach. A class is often scheduled while the paperwork is
 * still coming back. Only drawn for an instructor we actually have: while the
 * list is loading the instructor is unknown, which is not "not ready".
 */
function InstructorNotReadyAlert({ instructor }: { instructor?: Instructor }) {
  if (!instructor) return null;
  const status = instructorReadiness(instructor);
  if (status.kind !== 'not-ready') return null;
  return (
    <Alert severity="warning" data-testid="instructor-not-ready-alert">
      {instructor.name} isn&apos;t cleared to teach yet: missing{' '}
      {describeMissingReadiness(status.missing)}. You can still save this
      class.
    </Alert>
  );
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
  props: PickerDayProps & { selectedDates: Date[] }
) {
  const { selectedDates, day, ...rest } = props;
  const isSelected = selectedDates.some((d) => isSameDay(d, day));

  return (
    <PickerDay
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

/**
 * Starting values for a new class in each format. A private hour is one hour
 * for a group at the group price; a seat class keeps the long-standing
 * defaults the form has always used.
 */
const FORMAT_DEFAULTS: Record<
  ClassFormat,
  { durationMinutes: number; priceCents: number; capacity: number }
> = {
  seats: { durationMinutes: 120, priceCents: 4500, capacity: 8 },
  privateHours: { durationMinutes: 60, priceCents: 6000, capacity: 12 },
};

export function ClassForm({
  open,
  onClose,
  onSubmit,
  classItem,
  instructors = [],
  categories = [],
  isSubmitting = false,
  defaultDateTime,
  registrationCount = 0,
}: ClassFormProps) {
  useSignals();

  const hasRegistrations = !!classItem && registrationCount > 0;

  // ============================================================
  // FORM FIELD SIGNALS
  // ============================================================
  const name = useSignal('');
  // Seats (people register one by one) or private hours (one group per hour).
  const format = useSignal<ClassFormat>('seats');
  // Private hours only: start times offered on every selected date. Stored
  // as Dates whose hours/minutes are the time of day.
  const startTimes = useSignal<Date[]>([]);
  const pendingStartTime = useSignal<Date | null>(null);
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
  // Instructor's minimum headcount; staff get an email a week out if
  // confirmed seats are below it. Admin-only, never shown publicly.
  const minimumEnrollment = useSignal<number | null>(null);
  const priceCents = useSignal(0);
  const priceDisplay = useSignal('0.00');
  const imageUrl = useSignal('');
  const galleryImages = useSignal<GalleryImage[]>([]);
  const isPoolPickerOpen = useSignal(false);
  const categoryId = useSignal('');
  const skillLevel = useSignal<ClassSkillLevel>('all-levels');
  const status = useSignal<ClassStatus>('draft');
  const location = useSignal('Maple & Spruce');
  const room = useSignal<Room | null>(null);
  const durationMode = useSignal<'preset' | 'custom'>('preset');
  const materialsIncluded = useSignal('');
  const whatToBring = useSignal('');
  const minimumAge = useSignal<number | undefined>(undefined);
  const isFeatured = useSignal(false);

  // Referral program (per-class opt-in). When the toggle is on, every
  // confirmed registration auto-generates a single-use code in the
  // confirmation email — see legacy #373/#375.
  const referralEnabled = useSignal(false);
  const referralPercent = useSignal<number>(50);
  const referralExpiresAfterDays = useSignal<number>(60);

  // ============================================================
  // UI STATE SIGNALS
  // ============================================================
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);
  const imageUploadState = useSignal<ImageUploadState>({ status: 'idle' });
  const pendingImageFile = useSignal<File | null>(null);

  const isEdit = !!classItem;
  const isPrivateHours = useComputed(() => format.value === 'privateHours');

  // ============================================================
  // COMPOSE SESSIONS from date+time signals
  // ============================================================
  const composedSessions = useComputed<ClassSession[]>(() => {
    const dates = [...selectedDates.value].sort(
      (a, b) => a.getTime() - b.getTime()
    );
    if (dates.length === 0) return [];

    if (format.value === 'privateHours') {
      return buildPrivateHourSessions(
        dates,
        startTimes.value.map((t) => ({
          hours: t.getHours(),
          minutes: t.getMinutes(),
        }))
      );
    }

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

  // Switching a NEW class between formats swaps in that format's starting
  // values, but only for fields still at the other format's starting value,
  // so nothing the person typed is lost. An existing class keeps its values.
  const switchFormat = useCallback(
    (next: ClassFormat) => {
      if (next === format.value) return;
      if (!classItem) {
        const from = FORMAT_DEFAULTS[format.value];
        const to = FORMAT_DEFAULTS[next];
        batch(() => {
          if (durationMinutes.value === from.durationMinutes) {
            durationMinutes.value = to.durationMinutes;
            durationMode.value = 'preset';
          }
          if (priceCents.value === from.priceCents) {
            priceCents.value = to.priceCents;
            priceDisplay.value = (to.priceCents / 100).toFixed(2);
          }
          if (capacity.value === from.capacity) {
            capacity.value = to.capacity;
          }
        });
      }
      format.value = next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classItem]
  );

  // What to check the room against: each session, or for private hours one
  // span per day from the first hour to the end of the last. The gaps between
  // hours are the reset time, when the room is still in use.
  const roomChecks = useComputed<Array<{ start: Date; end: Date }>>(() => {
    const lengthMs = durationMinutes.value * 60_000;
    const spans = composedSessions.value.map((s) => ({
      start: s.dateTime,
      end: new Date(s.dateTime.getTime() + lengthMs),
    }));
    if (format.value !== 'privateHours') return spans;
    const byDay = new Map<string, { start: Date; end: Date }>();
    for (const span of spans) {
      const key = toDateKey(span.start);
      const day = byDay.get(key);
      if (!day) {
        byDay.set(key, { ...span });
      } else {
        if (span.start < day.start) day.start = span.start;
        if (span.end > day.end) day.end = span.end;
      }
    }
    return [...byDay.values()];
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
      format: format.value,
      registrationClosesAt: isPrivateHours.value
        ? undefined
        : registrationClosesAt.value ?? undefined,
      durationMinutes: durationMinutes.value,
      capacity: capacity.value,
      minimumEnrollment: isPrivateHours.value ? null : minimumEnrollment.value,
      priceCents: priceCents.value,
      categoryId: categoryId.value || undefined,
      skillLevel: skillLevel.value,
      status: status.value,
      location: location.value || undefined,
      room: room.value,
      materialsIncluded: materialsIncluded.value || undefined,
      whatToBring: whatToBring.value || undefined,
      minimumAge: minimumAge.value,
      galleryImages:
        galleryImages.value.length > 0 ? galleryImages.value : undefined,
      referralDiscount: referralEnabled.value
        ? {
            percent: referralPercent.value,
            expiresAfterDays: referralExpiresAfterDays.value,
          }
        : undefined,
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
    format: 'How people book',
    registrationClosesAt: 'Registration Close',
    durationMinutes: 'Duration',
    capacity: 'Capacity',
    minimumEnrollment: 'Minimum Enrollment',
    priceCents: 'Price',
    skillLevel: 'Skill Level',
    status: 'Status',
    minimumAge: 'Minimum Age',
    materialsIncluded: 'Materials Included',
    whatToBring: 'What to Bring',
    galleryImages: 'Gallery',
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
      const classFormat = getClassFormat(classItem);
      const sessionDates = classItem.sessions.map((s) =>
        s.dateTime instanceof Date ? s.dateTime : new Date(s.dateTime)
      );
      // A private-hours class has several sessions per day: the calendar
      // holds each day once and the start times hold the hours.
      const dates =
        classFormat === 'privateHours'
          ? sessionDates.filter(
              (d, i) =>
                sessionDates.findIndex((o) => isSameDay(o, d)) === i
            )
          : sessionDates;
      const hourStarts = getSessionStartTimes(classItem.sessions).map((t) => {
        const d = new Date();
        d.setHours(t.hours, t.minutes, 0, 0);
        return d;
      });

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
        format.value = classFormat;
        startTimes.value = classFormat === 'privateHours' ? hourStarts : [];
        pendingStartTime.value = null;
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
        minimumEnrollment.value = classItem.minimumEnrollment ?? null;
        priceCents.value = classItem.priceCents;
        priceDisplay.value = (classItem.priceCents / 100).toFixed(2);
        imageUrl.value = classItem.imageUrl ?? '';
        galleryImages.value = classItem.galleryImages
          ? classItem.galleryImages.map((img) => ({ ...img }))
          : [];
        categoryId.value = classItem.categoryId ?? '';
        skillLevel.value = classItem.skillLevel;
        status.value = classItem.status;
        location.value = classItem.location ?? '';
        room.value = classItem.room ?? null;
        durationMode.value = [60, 90, 120, 150, 180].includes(classItem.durationMinutes) ? 'preset' : 'custom';
        materialsIncluded.value = classItem.materialsIncluded ?? '';
        whatToBring.value = classItem.whatToBring ?? '';
        minimumAge.value = classItem.minimumAge;
        isFeatured.value = classItem.isFeatured === true;
        // Hydrate the toggle from the class doc; keep editable defaults of
        // 50% / 60d so toggling ON for a previously-disabled class shows
        // sensible starting values without requiring extra typing.
        referralEnabled.value = !!classItem.referralDiscount;
        referralPercent.value = classItem.referralDiscount?.percent ?? 50;
        referralExpiresAfterDays.value =
          classItem.referralDiscount?.expiresAfterDays ?? 60;

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
        format.value = 'seats';
        startTimes.value = [];
        pendingStartTime.value = null;
        description.value = '';
        shortDescription.value = '';
        instructorId.value = '';
        selectedDates.value = [];
        sharedTime.value = newClassDateTime;
        perDateTimes.value = new Map();
        useDifferentTimes.value = false;
        registrationClosesAt.value = null;
        durationMinutes.value = FORMAT_DEFAULTS.seats.durationMinutes;
        durationMode.value = 'preset';
        capacity.value = FORMAT_DEFAULTS.seats.capacity;
        minimumEnrollment.value = null;
        priceCents.value = FORMAT_DEFAULTS.seats.priceCents;
        priceDisplay.value = '45.00';
        imageUrl.value = '';
        galleryImages.value = [];
        categoryId.value = '';
        skillLevel.value = 'all-levels';
        status.value = 'draft';
        location.value = 'Maple & Spruce';
        room.value = null;
        materialsIncluded.value = '';
        whatToBring.value = '';
        minimumAge.value = undefined;
        isFeatured.value = false;
        referralEnabled.value = false;
        referralPercent.value = 50;
        referralExpiresAfterDays.value = 60;
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

  const addStartTime = useCallback(() => {
    const t = pendingStartTime.value;
    if (!t || isNaN(t.getTime())) return;
    const minute = t.getHours() * 60 + t.getMinutes();
    const exists = startTimes.value.some(
      (s) => s.getHours() * 60 + s.getMinutes() === minute
    );
    if (!exists) {
      startTimes.value = [...startTimes.value, t];
    }
    pendingStartTime.value = null;
  }, []);

  const removeStartTime = useCallback((t: Date) => {
    const minute = t.getHours() * 60 + t.getMinutes();
    startTimes.value = startTimes.value.filter(
      (s) => s.getHours() * 60 + s.getMinutes() !== minute
    );
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

  const uploadGalleryImage = useCallback(
    async (file: File): Promise<string> => {
      const functions = getMapleFunctions();
      const upload = httpsCallable<
        UploadClassGalleryImageRequest,
        UploadClassGalleryImageResponse
      >(functions, 'uploadClassGalleryImage');

      const imageBase64 = await readFileAsBase64(file);

      const result = await upload({
        classId: classItem?.id,
        imageBase64,
        contentType: file.type,
      });

      if (!result.data.success) {
        throw new Error('Gallery image upload failed');
      }

      return result.data.url;
    },
    [classItem?.id]
  );

  // ============================================================
  // SUBMIT
  // ============================================================

  /**
   * Internal save-in-flight flag. Deliberately a signal rather than React
   * state: it must flip synchronously so a second click cannot re-enter
   * `handleSubmit` before React re-renders the disabled button.
   */
  const isSaving = useSignal(false);

  const handleSubmit = useCallback(async () => {
    // Synchronous re-entrancy guard. The `isSubmitting` PROP is React state
    // owned by the parent page and set with `setIsSubmitting(true)` after the
    // await has already started — batched, so it does not reach the button
    // until React re-renders. A second click inside that window otherwise
    // reaches this handler again and fires a second createClass, and a create
    // gets a server-generated id with no uniqueness check: one save, two
    // classes. A signal mutates synchronously, so it closes the window.
    // Same fix as RegistrationCheckoutForm (legacy #286).
    if (isSaving.value) {
      return;
    }

    showValidationErrors.value = true;

    if (!isValid.value) {
      return;
    }

    submitError.value = null;
    isSaving.value = true;

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
        // Always sent, so switching back to seats is saved.
        format: format.value,
        // A private hour closes when it starts (per-hour cutoff), so the
        // class-wide override does not apply.
        registrationClosesAt: isPrivateHours.value
          ? undefined
          : registrationClosesAt.value ?? undefined,
        durationMinutes: durationMinutes.value,
        capacity: capacity.value,
        // null (not undefined) so clearing the field on edit removes the
        // stored minimum instead of being dropped from the update. A
        // private-hours class has no minimum: each hour is one group.
        minimumEnrollment: isPrivateHours.value
          ? null
          : minimumEnrollment.value,
        priceCents: priceCents.value,
        imageUrl: currentImageUrl || undefined,
        galleryImages:
          galleryImages.value.length > 0 ? galleryImages.value : undefined,
        categoryId: categoryId.value || undefined,
        skillLevel: skillLevel.value,
        status: status.value,
        location: location.value || undefined,
        room: room.value,
        materialsIncluded: materialsIncluded.value || undefined,
        whatToBring: whatToBring.value || undefined,
        minimumAge: minimumAge.value,
        // false (not undefined) so switching it off on edit is saved.
        isFeatured: isFeatured.value,
        referralDiscount: referralEnabled.value
          ? {
              percent: referralPercent.value,
              expiresAfterDays: referralExpiresAfterDays.value,
            }
          : undefined,
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
    } finally {
      isSaving.value = false;
    }
  }, [onSubmit, onClose, classItem?.id]);

  // Sorted selected dates for display
  const sortedDates = useMemo(
    () => [...selectedDates.value].sort((a, b) => a.getTime() - b.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDates.value]
  );

  const sortedStartTimes = [...startTimes.value].sort(
    (a, b) =>
      a.getHours() * 60 + a.getMinutes() - (b.getHours() * 60 + b.getMinutes())
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

            {hasRegistrations && (
              <Alert severity="info">
                {registrationCount}{' '}
                {registrationCount === 1
                  ? 'customer has'
                  : 'customers have'}{' '}
                already registered. Dates, times, duration, price,
                instructor, and location are locked because customers paid
                with those expectations. Cancel and re-issue the class if
                you need to change them.
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

            {/* Gallery */}
            {(() => {
              const selectedCategory = categories.find(
                (c) => c.id === categoryId.value
              );
              const pool = selectedCategory?.galleryImages ?? [];
              const alreadyAdded = new Set(
                galleryImages.value.map((img) => img.url)
              );
              const remainingCapacity = Math.max(
                0,
                10 - galleryImages.value.length
              );
              const poolDisabledHint = !selectedCategory
                ? 'Select a category to access its image pool'
                : pool.length === 0
                  ? "This category's pool is empty"
                  : undefined;

              return (
                <>
                  <GalleryEditor
                    label="Gallery"
                    value={galleryImages.value}
                    onChange={(next) => (galleryImages.value = next)}
                    onUploadFile={uploadGalleryImage}
                    onPickFromPool={() => (isPoolPickerOpen.value = true)}
                    pickFromPoolLabel={
                      selectedCategory
                        ? `Add from ${selectedCategory.name} pool`
                        : 'Add from category pool'
                    }
                    pickFromPoolDisabled={
                      !selectedCategory || pool.length === 0
                    }
                    pickFromPoolDisabledHint={poolDisabledHint}
                    error={getFieldError('galleryImages') ?? undefined}
                  />
                  {selectedCategory && (
                    <CategoryGalleryPickerDialog
                      open={isPoolPickerOpen.value}
                      categoryName={selectedCategory.name}
                      pool={pool}
                      alreadyAdded={alreadyAdded}
                      remainingCapacity={remainingCapacity}
                      onClose={() => (isPoolPickerOpen.value = false)}
                      onConfirm={(picks) => {
                        galleryImages.value = [
                          ...galleryImages.value,
                          ...picks.map((img) => ({ ...img })),
                        ];
                      }}
                    />
                  )}
                </>
              );
            })()}

            {/* How people book: seats or private group hours */}
            <Box>
              <Typography variant="subtitle2" gutterBottom id="class-format-label">
                How people book this class
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={format.value}
                onChange={(_e, v: ClassFormat | null) => {
                  if (v) switchFormat(v);
                }}
                aria-labelledby="class-format-label"
                disabled={hasRegistrations}
                size="small"
              >
                <ToggleButton value="seats">Seats</ToggleButton>
                <ToggleButton value="privateHours">Private group hours</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="textSecondary" component="p" sx={{ mt: 0.5 }}>
                {isPrivateHours.value
                  ? 'Each date is split into hours. One group books an hour and has the room to itself.'
                  : 'People register one by one for the class dates.'}
              </Typography>
            </Box>

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

            {/* Featured on /upcoming-classes */}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={isFeatured.value}
                    onChange={(e) => (isFeatured.value = e.target.checked)}
                  />
                }
                label="Feature on Upcoming Classes"
              />
              <Typography variant="caption" color="textSecondary" component="p">
                Shows this class as a large photo card on the website. A
                featured class that fills up goes back to a normal row until a
                seat opens.
              </Typography>
            </Box>

            {/* Short Description */}
            <TextField
              label="Short Description"
              value={shortDescription.value}
              onChange={(e) => (shortDescription.value = e.target.value)}
              error={!!getFieldError('shortDescription')}
              helperText={getFieldError('shortDescription') || 'Brief tagline for listings (max 160 chars)'}
              fullWidth
              slotProps={{
                htmlInput: { maxLength: 160 }
              }}
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
                {isPrivateHours.value ? 'Dates and start times *' : 'Class Dates *'}
              </Typography>

              {/* Calendar */}
              <DateCalendar
                disablePast
                disabled={hasRegistrations}
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
                      onDelete={
                        hasRegistrations ? undefined : () => removeDate(d)
                      }
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

              {/* Private hours: start times shared by every date */}
              {isPrivateHours.value && (
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TimePicker
                      label="Start time"
                      value={pendingStartTime.value}
                      onChange={(v) => (pendingStartTime.value = v)}
                      disabled={hasRegistrations}
                      slotProps={{
                        textField: { size: 'small', sx: { width: 180 } },
                      }}
                    />
                    <Button
                      variant="outlined"
                      onClick={addStartTime}
                      disabled={hasRegistrations || !pendingStartTime.value}
                    >
                      Add start time
                    </Button>
                  </Box>
                  {sortedStartTimes.length > 0 && (
                    <Box
                      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
                      data-testid="private-hour-start-times"
                    >
                      {sortedStartTimes.map((t) => (
                        <Chip
                          key={`${t.getHours()}:${t.getMinutes()}`}
                          label={t.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                          onDelete={
                            hasRegistrations ? undefined : () => removeStartTime(t)
                          }
                          size="small"
                        />
                      ))}
                    </Box>
                  )}
                  <Typography variant="caption" color="textSecondary">
                    {composedSessions.value.length > 0
                      ? `${composedSessions.value.length} bookable ${composedSessions.value.length === 1 ? 'hour' : 'hours'}: the same start times on every date. Each one holds the room for its group.`
                      : 'Pick dates and add start times. Every start time is offered on every date.'}
                  </Typography>
                </Box>
              )}

              {/* Time controls */}
              {!isPrivateHours.value && sortedDates.length > 0 && (
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
                          disabled={hasRegistrations}
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
                      disabled={hasRegistrations}
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
                              disabled={hasRegistrations}
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

            {/* Registration Close (optional). Seats only: a private hour
                closes when it starts. */}
            {!isPrivateHours.value && (
            <DateTimePicker
              label="Registration closes (optional)"
              value={registrationClosesAt.value}
              onChange={(v) => (registrationClosesAt.value = v)}
              disabled={hasRegistrations}
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
            )}

            {/* Row: Duration, Price */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl sx={{ minWidth: 160 }} error={!!getFieldError('durationMinutes')} required disabled={hasRegistrations}>
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
                  disabled={hasRegistrations}
                  sx={{ width: 130 }}
                  slotProps={{
                    input: {
                      endAdornment: <InputAdornment position="end">min</InputAdornment>,
                    }
                  }}
                />
              )}
              <TextField
                label={isPrivateHours.value ? 'Price per group' : 'Price'}
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
                disabled={hasRegistrations}
                sx={{ width: isPrivateHours.value ? 150 : 120 }}
                required
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }
                }}
              />
            </Box>

            {/* Row: Capacity, Skill Level, Category */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label={isPrivateHours.value ? 'Largest group' : 'Capacity'}
                type="number"
                value={capacity.value}
                onChange={(e) => (capacity.value = parseInt(e.target.value) || 0)}
                error={!!getFieldError('capacity')}
                helperText={
                  getFieldError('capacity') ||
                  (isPrivateHours.value ? 'Most people in one group' : 'Max participants')
                }
                sx={{ width: isPrivateHours.value ? 200 : 120 }}
                required
              />
              {!isPrivateHours.value && (
              <TextField
                label="Minimum Enrollment"
                type="number"
                value={minimumEnrollment.value ?? ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  minimumEnrollment.value = isNaN(val) ? null : val;
                }}
                error={!!getFieldError('minimumEnrollment')}
                helperText={
                  getFieldError('minimumEnrollment') ||
                  'Optional. Staff get an email a week out if below this'
                }
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
                sx={{ width: 220 }}
              />
              )}
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
              <FormControl fullWidth error={!!getFieldError('instructorId')} disabled={hasRegistrations}>
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
            <InstructorNotReadyAlert
              instructor={instructors.find((i) => i.id === instructorId.value)}
            />

            {/* Location */}
            <TextField
              label="Location"
              value={location.value}
              onChange={(e) => (location.value = e.target.value)}
              helperText="Optional - defaults to store address if not specified"
              disabled={hasRegistrations}
              fullWidth
            />

            {/* Room */}
            <FormControl fullWidth>
              <InputLabel id="class-room-label">Room</InputLabel>
              <Select<Room | ''>
                labelId="class-room-label"
                value={room.value ?? ''}
                label="Room"
                onChange={(e) =>
                  (room.value =
                    e.target.value === '' ? null : (e.target.value as Room))
                }
              >
                <MenuItem value="">No specific room</MenuItem>
                {ROOMS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {getRoomLabel(r)}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Set this if the class is held in a bookable room — its
                sessions block the room and flag conflicts.
              </FormHelperText>
            </FormControl>

            {/* Per-session room availability when a room is chosen */}
            {room.value && roomChecks.value.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {roomChecks.value.map((check) => (
                  <Box key={check.start.toISOString()} data-testid="room-check">
                    <RoomAvailability
                      room={room.value as Room}
                      start={check.start}
                      end={check.end}
                      ignoreSourceRef={
                        classItem ? `classes/${classItem.id}` : undefined
                      }
                    />
                  </Box>
                ))}
              </Box>
            )}

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

            {/* Friend referral program (per-class opt-in) */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={referralEnabled.value}
                    onChange={(e) => (referralEnabled.value = e.target.checked)}
                  />
                }
                label="Enable friend referral program"
              />
              <Typography variant="caption" color="textSecondary" sx={{ mt: -1 }}>
                When enabled, every confirmed registration includes a unique
                single-use code in the confirmation email that the customer
                can share with a friend.
              </Typography>
              {referralEnabled.value && (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Friend gets"
                    type="number"
                    value={referralPercent.value}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      referralPercent.value = isNaN(val) ? 0 : val;
                    }}
                    error={!!getFieldError('referralDiscount')}
                    helperText={
                      getFieldError('referralDiscount') ?? '1–100% off'
                    }
                    sx={{ width: 200 }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">% off</InputAdornment>
                        ),
                      },

                      htmlInput: { min: 1, max: 100, step: 1 }
                    }} />
                  <TextField
                    label="Code expires after"
                    type="number"
                    value={referralExpiresAfterDays.value}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      referralExpiresAfterDays.value = isNaN(val) ? 0 : val;
                    }}
                    error={!!getFieldError('referralDiscount')}
                    helperText="1–365 days"
                    sx={{ width: 220 }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">days</InputAdornment>
                        ),
                      },

                      htmlInput: { min: 1, max: 365, step: 1 }
                    }} />
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting || isSaving.value}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={
              isSubmitting ||
              isSaving.value ||
              imageUploadState.value.status === 'uploading'
            }
          >
            {isSubmitting ||
            isSaving.value ||
            imageUploadState.value.status === 'uploading'
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
