'use client';

/**
 * InstructorForm - Instructor Form using Preact Signals
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
  Chip,
  Autocomplete,
} from '@mui/material';
import type {
  Instructor,
  CreateInstructorInput,
  PayeeStatus,
  InstructorPayRateType,
} from '@maple/ts/domain';
import { instructorValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

interface InstructorFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateInstructorInput) => Promise<void>;
  instructor?: Instructor;
  isSubmitting?: boolean;
}

// Common specialties for autocomplete suggestions
const SPECIALTY_SUGGESTIONS = [
  'weaving',
  'natural dyeing',
  'knitting',
  'crochet',
  'embroidery',
  'felting',
  'spinning',
  'quilting',
  'sewing',
  'woodworking',
  'pottery',
  'ceramics',
  'basket weaving',
  'macrame',
  'leather crafts',
];

export function InstructorForm({
  open,
  onClose,
  onSubmit,
  instructor,
  isSubmitting = false,
}: InstructorFormProps) {
  // Enable signals tracking in this component
  useSignals();

  // ============================================================
  // FORM FIELD SIGNALS
  // ============================================================
  const name = useSignal('');
  const email = useSignal('');
  const phone = useSignal('');
  const status = useSignal<PayeeStatus>('active');
  const notes = useSignal('');
  const bio = useSignal('');
  const specialties = useSignal<string[]>([]);
  const payRate = useSignal<number | undefined>(undefined);
  const payRateType = useSignal<InstructorPayRateType | undefined>(undefined);

  // ============================================================
  // UI STATE SIGNALS
  // ============================================================
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const isEdit = !!instructor;

  // ============================================================
  // VALIDATION
  // ============================================================

  const validation = useComputed(() => {
    return instructorValidation({
      name: name.value,
      email: email.value,
      phone: phone.value || undefined,
      status: status.value,
      notes: notes.value || undefined,
      bio: bio.value || undefined,
      specialties: specialties.value.length > 0 ? specialties.value : undefined,
      payRate: payRate.value,
      payRateType: payRateType.value,
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

    if (instructor) {
      batch(() => {
        name.value = instructor.name;
        email.value = instructor.email;
        phone.value = instructor.phone ?? '';
        status.value = instructor.status;
        notes.value = instructor.notes ?? '';
        bio.value = instructor.bio ?? '';
        specialties.value = instructor.specialties ?? [];
        payRate.value = instructor.payRate;
        payRateType.value = instructor.payRateType;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      batch(() => {
        name.value = '';
        email.value = '';
        phone.value = '';
        status.value = 'active';
        notes.value = '';
        bio.value = '';
        specialties.value = [];
        payRate.value = undefined;
        payRateType.value = undefined;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instructor]);

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;

    if (!isValid.value) {
      return;
    }

    submitError.value = null;

    try {
      const input: CreateInstructorInput = {
        name: name.value,
        email: email.value,
        phone: phone.value || undefined,
        status: status.value,
        notes: notes.value || undefined,
        bio: bio.value || undefined,
        specialties: specialties.value.length > 0 ? specialties.value : undefined,
        payRate: payRate.value,
        payRateType: payRateType.value,
      };

      await onSubmit(input);
      onClose();
    } catch (error: unknown) {
      let message = 'Failed to save instructor';
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
  }, [onSubmit, onClose]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Instructor' : 'Add Instructor'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          {/* Name */}
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

          {/* Bio */}
          <TextField
            label="Bio"
            value={bio.value}
            onChange={(e) => (bio.value = e.target.value)}
            error={!!getFieldError('bio')}
            helperText={getFieldError('bio') || 'Brief bio for public display'}
            multiline
            rows={3}
            fullWidth
          />

          {/* Specialties */}
          <Autocomplete
            multiple
            freeSolo
            options={SPECIALTY_SUGGESTIONS}
            value={specialties.value}
            onChange={(_, newValue) => {
              specialties.value = newValue;
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const { key, ...props } = getTagProps({ index });
                return (
                  <Chip
                    key={key}
                    variant="outlined"
                    label={option}
                    size="small"
                    {...props}
                  />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Specialties"
                placeholder="Add specialty..."
                helperText="Press Enter to add custom specialties"
              />
            )}
          />

          {/* Pay Rate Type */}
          <FormControl fullWidth>
            <InputLabel id="pay-rate-type-label">Pay Rate Type</InputLabel>
            <Select
              labelId="pay-rate-type-label"
              id="pay-rate-type-select"
              value={payRateType.value ?? ''}
              label="Pay Rate Type"
              onChange={(e) =>
                (payRateType.value = (e.target.value as InstructorPayRateType) || undefined)
              }
            >
              <MenuItem value="">
                <em>Not set</em>
              </MenuItem>
              <MenuItem value="flat">Flat rate per class</MenuItem>
              <MenuItem value="hourly">Hourly rate</MenuItem>
              <MenuItem value="percentage">Percentage of class revenue</MenuItem>
            </Select>
            <FormHelperText>How this instructor is compensated</FormHelperText>
          </FormControl>

          {/* Pay Rate (only show if pay rate type is set) */}
          {payRateType.value && (
            <TextField
              label={
                payRateType.value === 'flat'
                  ? 'Flat Rate ($)'
                  : payRateType.value === 'hourly'
                    ? 'Hourly Rate ($)'
                    : 'Percentage (%)'
              }
              type="number"
              value={
                payRateType.value === 'percentage'
                  ? payRate.value !== undefined
                    ? payRate.value
                    : ''
                  : payRate.value !== undefined
                    ? payRate.value / 100
                    : ''
              }
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (isNaN(val)) {
                  payRate.value = undefined;
                } else if (payRateType.value === 'percentage') {
                  payRate.value = val;
                } else {
                  // Convert dollars to cents for flat/hourly
                  payRate.value = Math.round(val * 100);
                }
              }}
              helperText={
                payRateType.value === 'flat'
                  ? 'Amount paid per class'
                  : payRateType.value === 'hourly'
                    ? 'Amount paid per hour'
                    : 'Percentage of class revenue'
              }
              fullWidth
            />
          )}

          {/* Status */}
          <FormControl fullWidth error={!!getFieldError('status')}>
            <InputLabel>Status</InputLabel>
            <Select
              value={status.value}
              label="Status"
              onChange={(e) => (status.value = e.target.value as PayeeStatus)}
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
            label="Internal Notes"
            value={notes.value}
            onChange={(e) => (notes.value = e.target.value)}
            multiline
            rows={2}
            helperText="Optional internal notes (not shown publicly)"
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
