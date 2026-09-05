'use client';

/**
 * StudentForm - Music lesson student form using Preact Signals.
 *
 * Mirrors InstructorForm's signals idiom:
 * - `useSignals()` runtime hook at the top
 * - `useSignal()` per form field
 * - `useComputed()` for derived state (validation, errors, field errors)
 * - `batch()` when resetting multiple fields together
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
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Alert,
  Divider,
  Typography,
} from '@mui/material';
import type {
  Instructor,
  Instrument,
  LessonLength,
  Student,
  StudentStatus,
  CreateStudentInput,
} from '@maple/ts/domain';
import { INSTRUMENTS, LESSON_LENGTHS } from '@maple/ts/domain';
import { studentValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';
import { INSTRUMENT_LABELS, LESSON_LENGTH_LABELS } from './labels';

interface StudentFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateStudentInput) => Promise<void>;
  student?: Student;
  instructors: Instructor[];
  isSubmitting?: boolean;
  /**
   * Seed values for a NEW student, e.g. everything a lesson inquiry already
   * knows (#819). Ignored when editing, where the record itself is the truth.
   *
   * Only the keys present are applied; the rest keep their blank defaults. A
   * draft is not a decision, so this fills the form and stops — the person
   * still reviews every field and presses the button.
   */
  prefill?: Partial<CreateStudentInput>;
  /**
   * Shown above the fields when a prefill came from somewhere the user should
   * know about ("Prefilled from Robin Ashfield's inquiry"), so a form that
   * mysteriously has content in it explains itself.
   */
  prefillNote?: string;
}

export function StudentForm({
  open,
  onClose,
  onSubmit,
  student,
  instructors,
  isSubmitting = false,
  prefill,
  prefillNote,
}: StudentFormProps) {
  useSignals();

  // ============================================================
  // FORM FIELD SIGNALS
  // ============================================================
  const name = useSignal('');
  const instrument = useSignal<Instrument>('piano');
  const isAdultStudent = useSignal(false);
  const primaryTeacherId = useSignal('');
  const registeredLessonLength = useSignal<LessonLength | ''>('');
  const isHopeScholarship = useSignal(false);
  const primaryContactName = useSignal('');
  const primaryContactEmail = useSignal('');
  const primaryContactPhone = useSignal('');
  const secondaryContactEmail = useSignal('');
  const secondaryContactPhone = useSignal('');
  const venmoUsername = useSignal('');
  const autoInvoice = useSignal(false);
  const lessonRateCents = useSignal('');
  const notes = useSignal('');
  const status = useSignal<StudentStatus>('active');

  // ============================================================
  // UI STATE SIGNALS
  // ============================================================
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const isEdit = !!student;

  // ============================================================
  // VALIDATION
  // ============================================================
  const validation = useComputed(() => {
    return studentValidation({
      name: name.value,
      instrument: instrument.value,
      isAdultStudent: isAdultStudent.value,
      primaryTeacherId: primaryTeacherId.value,
      registeredLessonLength: registeredLessonLength.value || undefined,
      isHopeScholarship: isHopeScholarship.value,
      autoInvoice: autoInvoice.value,
      lessonRateCents: lessonRateCents.value
        ? Math.round(parseFloat(lessonRateCents.value) * 100)
        : undefined,
      primaryContactName: primaryContactName.value,
      primaryContactEmail: primaryContactEmail.value,
      primaryContactPhone: primaryContactPhone.value || undefined,
      secondaryContactEmail: secondaryContactEmail.value || undefined,
      secondaryContactPhone: secondaryContactPhone.value || undefined,
      venmoUsername: venmoUsername.value || undefined,
      notes: notes.value || undefined,
      status: status.value,
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

    if (student) {
      batch(() => {
        name.value = student.name;
        instrument.value = student.instrument;
        isAdultStudent.value = student.isAdultStudent;
        primaryTeacherId.value = student.primaryTeacherId;
        registeredLessonLength.value = student.registeredLessonLength ?? '';
        isHopeScholarship.value = student.isHopeScholarship;
        primaryContactName.value = student.primaryContactName;
        primaryContactEmail.value = student.primaryContactEmail;
        primaryContactPhone.value = student.primaryContactPhone ?? '';
        secondaryContactEmail.value = student.secondaryContactEmail ?? '';
        secondaryContactPhone.value = student.secondaryContactPhone ?? '';
        venmoUsername.value = student.venmoUsername ?? '';
        autoInvoice.value = student.autoInvoice ?? false;
        lessonRateCents.value =
          student.lessonRateCents != null
            ? (student.lessonRateCents / 100).toString()
            : '';
        notes.value = student.notes ?? '';
        status.value = student.status;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      batch(() => {
        name.value = '';
        instrument.value = 'piano';
        isAdultStudent.value = false;
        primaryTeacherId.value = '';
        registeredLessonLength.value = '';
        isHopeScholarship.value = false;
        primaryContactName.value = '';
        primaryContactEmail.value = '';
        primaryContactPhone.value = '';
        secondaryContactEmail.value = '';
        secondaryContactPhone.value = '';
        venmoUsername.value = '';
        autoInvoice.value = false;
        lessonRateCents.value = '';
        notes.value = '';
        status.value = 'active';

        // Seed from the inquiry, if we came in that way. Applied after the
        // reset rather than instead of it, so reopening the plain "Add student"
        // button can never inherit the last inquiry's values.
        if (prefill) {
          if (prefill.name != null) name.value = prefill.name;
          if (prefill.instrument != null) instrument.value = prefill.instrument;
          if (prefill.isAdultStudent != null) {
            isAdultStudent.value = prefill.isAdultStudent;
          }
          if (prefill.primaryTeacherId != null) {
            primaryTeacherId.value = prefill.primaryTeacherId;
          }
          if (prefill.registeredLessonLength != null) {
            registeredLessonLength.value = prefill.registeredLessonLength;
          }
          if (prefill.isHopeScholarship != null) {
            isHopeScholarship.value = prefill.isHopeScholarship;
          }
          if (prefill.primaryContactName != null) {
            primaryContactName.value = prefill.primaryContactName;
          }
          if (prefill.primaryContactEmail != null) {
            primaryContactEmail.value = prefill.primaryContactEmail;
          }
          if (prefill.primaryContactPhone != null) {
            primaryContactPhone.value = prefill.primaryContactPhone;
          }
          if (prefill.notes != null) notes.value = prefill.notes;
          if (prefill.status != null) status.value = prefill.status;
        }

        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student, prefill]);

  // ============================================================
  // HANDLERS
  // ============================================================
  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;

    if (!isValid.value) {
      return;
    }

    // Signal writes are synchronous — guards against double-submit.
    if (isSubmitting) return;

    submitError.value = null;

    try {
      const input: CreateStudentInput = {
        name: name.value,
        instrument: instrument.value,
        isAdultStudent: isAdultStudent.value,
        primaryTeacherId: primaryTeacherId.value,
        registeredLessonLength: registeredLessonLength.value || undefined,
        isHopeScholarship: isHopeScholarship.value,
        autoInvoice: autoInvoice.value,
        lessonRateCents: lessonRateCents.value
          ? Math.round(parseFloat(lessonRateCents.value) * 100)
          : undefined,
        primaryContactName: primaryContactName.value,
        primaryContactEmail: primaryContactEmail.value,
        primaryContactPhone: primaryContactPhone.value || undefined,
        secondaryContactEmail: secondaryContactEmail.value || undefined,
        secondaryContactPhone: secondaryContactPhone.value || undefined,
        // Store without the leading @ the user may have pasted.
        venmoUsername:
          venmoUsername.value.trim().replace(/^@/, '') || undefined,
        notes: notes.value || undefined,
        status: status.value,
      };

      await onSubmit(input);
      onClose();
    } catch (error: unknown) {
      let message = 'Failed to save student';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSubmit, onClose, isSubmitting]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Student' : 'Add Student'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          {!isEdit && prefillNote && (
            <Alert severity="info" icon={false}>
              {prefillNote}
            </Alert>
          )}

          {/* Student name */}
          <TextField
            label="Student name"
            value={name.value}
            onChange={(e) => (name.value = e.target.value)}
            error={!!getFieldError('name')}
            helperText={getFieldError('name')}
            required
            fullWidth
          />

          {/* Instrument */}
          <FormControl fullWidth error={!!getFieldError('instrument')}>
            <InputLabel id="student-instrument-label">Instrument</InputLabel>
            <Select
              labelId="student-instrument-label"
              label="Instrument"
              value={instrument.value}
              onChange={(e) =>
                (instrument.value = e.target.value as Instrument)
              }
            >
              {INSTRUMENTS.map((inst) => (
                <MenuItem key={inst} value={inst}>
                  {INSTRUMENT_LABELS[inst]}
                </MenuItem>
              ))}
            </Select>
            {getFieldError('instrument') && (
              <FormHelperText>{getFieldError('instrument')}</FormHelperText>
            )}
          </FormControl>

          {/* Primary teacher */}
          <FormControl fullWidth error={!!getFieldError('primaryTeacherId')}>
            <InputLabel id="student-teacher-label">Primary teacher</InputLabel>
            <Select
              labelId="student-teacher-label"
              label="Primary teacher"
              value={primaryTeacherId.value}
              onChange={(e) => (primaryTeacherId.value = e.target.value)}
            >
              {instructors.length === 0 && (
                <MenuItem value="" disabled>
                  <em>No instructors available</em>
                </MenuItem>
              )}
              {instructors.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {getFieldError('primaryTeacherId') ??
                'Individual lessons may record a substitute teacher.'}
            </FormHelperText>
          </FormControl>

          {/* Registered lesson length (optional) */}
          <FormControl
            fullWidth
            error={!!getFieldError('registeredLessonLength')}
          >
            <InputLabel id="student-lesson-length-label">
              Registered lesson length
            </InputLabel>
            <Select
              labelId="student-lesson-length-label"
              label="Registered lesson length"
              value={registeredLessonLength.value}
              onChange={(e) =>
                (registeredLessonLength.value = e.target.value as
                  | LessonLength
                  | '')
              }
            >
              <MenuItem value="">
                <em>Not set</em>
              </MenuItem>
              {LESSON_LENGTHS.map((len) => (
                <MenuItem key={len} value={len}>
                  {LESSON_LENGTH_LABELS[len]}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {getFieldError('registeredLessonLength') ??
                'For tracking — not enforced on lessons or invoices.'}
            </FormHelperText>
          </FormControl>

          {/* Flags */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isAdultStudent.value}
                  onChange={(e) => (isAdultStudent.value = e.target.checked)}
                />
              }
              label="Adult student"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={isHopeScholarship.value}
                  onChange={(e) =>
                    (isHopeScholarship.value = e.target.checked)
                  }
                />
              }
              label="Hope Scholarship (WV)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={autoInvoice.value}
                  disabled={isHopeScholarship.value}
                  onChange={(e) => (autoInvoice.value = e.target.checked)}
                />
              }
              label="Automatically invoice after each lesson is taught"
            />
          </Box>

          {/* Lesson rate — the per-student override for auto-invoicing */}
          <TextField
            label="Lesson rate override ($)"
            value={lessonRateCents.value}
            onChange={(e) => (lessonRateCents.value = e.target.value)}
            error={!!getFieldError('lessonRateCents')}
            helperText={
              getFieldError('lessonRateCents') ||
              'Dollars per lesson. Leave blank to use the standard rate for their lesson length.'
            }
            type="number"
            fullWidth
          />

          <Divider />

          {/* Primary contact — section header reflects adult-student flag */}
          <Typography variant="overline" color="text.secondary">
            {isAdultStudent.value ? 'Contact' : 'Parent / guardian'}
          </Typography>
          <TextField
            label="Primary contact name"
            value={primaryContactName.value}
            onChange={(e) => (primaryContactName.value = e.target.value)}
            error={!!getFieldError('primaryContactName')}
            helperText={getFieldError('primaryContactName')}
            required
            fullWidth
          />
          <TextField
            label="Primary contact email"
            type="email"
            value={primaryContactEmail.value}
            onChange={(e) => (primaryContactEmail.value = e.target.value)}
            error={!!getFieldError('primaryContactEmail')}
            helperText={getFieldError('primaryContactEmail')}
            required
            fullWidth
          />
          <TextField
            label="Primary contact phone"
            value={primaryContactPhone.value}
            onChange={(e) => (primaryContactPhone.value = e.target.value)}
            error={!!getFieldError('primaryContactPhone')}
            helperText={getFieldError('primaryContactPhone') || 'Optional'}
            fullWidth
          />

          <Divider />

          {/* Secondary contact */}
          <Typography variant="overline" color="text.secondary">
            Secondary contact (optional)
          </Typography>
          <TextField
            label="Secondary contact email"
            type="email"
            value={secondaryContactEmail.value}
            onChange={(e) => (secondaryContactEmail.value = e.target.value)}
            error={!!getFieldError('secondaryContactEmail')}
            helperText={getFieldError('secondaryContactEmail')}
            fullWidth
          />
          <TextField
            label="Secondary contact phone"
            value={secondaryContactPhone.value}
            onChange={(e) => (secondaryContactPhone.value = e.target.value)}
            error={!!getFieldError('secondaryContactPhone')}
            helperText={getFieldError('secondaryContactPhone')}
            fullWidth
          />

          <Divider />

          {/* Payment */}
          <Typography variant="overline" color="text.secondary">
            Payment (optional)
          </Typography>
          <TextField
            label="Venmo username"
            value={venmoUsername.value}
            onChange={(e) => (venmoUsername.value = e.target.value)}
            error={!!getFieldError('venmoUsername')}
            helperText={
              getFieldError('venmoUsername') ||
              'Used to match Venmo lesson payments during reconciliation.'
            }
            fullWidth
          />

          <Divider />

          {/* Status */}
          <FormControl fullWidth error={!!getFieldError('status')}>
            <InputLabel id="student-status-label">Status</InputLabel>
            <Select
              labelId="student-status-label"
              label="Status"
              value={status.value}
              onChange={(e) =>
                (status.value = e.target.value as StudentStatus)
              }
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
            label="Internal notes"
            value={notes.value}
            onChange={(e) => (notes.value = e.target.value)}
            error={!!getFieldError('notes')}
            helperText={getFieldError('notes') || 'Optional'}
            multiline
            rows={3}
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
