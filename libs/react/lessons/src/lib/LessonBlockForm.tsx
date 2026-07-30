'use client';

/**
 * LessonBlockForm — create/edit a weekly lesson block (#689).
 *
 * A block is a weekly constraint window (teacher + weekday + start/end time)
 * that lessons must fall inside. Times are entered as shop wall-clock (ET) and
 * stored as minutes-from-midnight. A block's teacher can't be reassigned once
 * created (the backend omits it from updates), so the teacher select is locked
 * when editing.
 */
import { useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import type {
  CreateLessonBlockInput,
  Instructor,
  LessonBlock,
} from '@maple/ts/domain';
import { WEEKDAY_LONG } from '@maple/ts/domain';
import { lessonBlockValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

export interface LessonBlockFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateLessonBlockInput) => Promise<void>;
  /** Present => edit mode. */
  block?: LessonBlock;
  /** Teachers the block can be attributed to. */
  instructors: Instructor[];
  isSubmitting?: boolean;
}

/** A local Date carrying just the given wall-clock time (date part is arbitrary). */
function minutesToDate(minutes: number): Date {
  return new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
}

/** Wall-clock minutes-from-midnight of a picked time (as entered, shop tz). */
function dateToMinutes(d: Date | null): number | undefined {
  if (!d || Number.isNaN(d.getTime())) return undefined;
  return d.getHours() * 60 + d.getMinutes();
}

export function LessonBlockForm({
  open,
  onClose,
  onSubmit,
  block,
  instructors,
  isSubmitting = false,
}: LessonBlockFormProps) {
  useSignals();

  const teacherId = useSignal('');
  const dayOfWeek = useSignal<number>(1); // Monday default
  const startTime = useSignal<Date | null>(minutesToDate(15 * 60)); // 3:00 PM
  const endTime = useSignal<Date | null>(minutesToDate(18 * 60)); // 6:00 PM
  const label = useSignal('');

  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const isEdit = !!block;

  const startMinutes = useComputed(() => dateToMinutes(startTime.value));
  const endMinutes = useComputed(() => dateToMinutes(endTime.value));

  const validation = useComputed(() =>
    lessonBlockValidation({
      teacherId: teacherId.value,
      dayOfWeek: dayOfWeek.value,
      startMinutes: startMinutes.value,
      endMinutes: endMinutes.value,
      label: label.value || undefined,
    }),
  );
  const errors = useComputed<Record<string, string[]>>(() =>
    showValidationErrors.value ? validation.value.getErrors() : {},
  );
  const isValid = useComputed(() => validation.value.isValid());
  const getFieldError = (field: string): string | null =>
    errors.value[field]?.[0] ?? null;

  useEffect(() => {
    if (!open) return;
    batch(() => {
      teacherId.value = block?.teacherId ?? '';
      dayOfWeek.value = block?.dayOfWeek ?? 1;
      startTime.value = minutesToDate(block?.startMinutes ?? 15 * 60);
      endTime.value = minutesToDate(block?.endMinutes ?? 18 * 60);
      label.value = block?.label ?? '';
      showValidationErrors.value = false;
      submitError.value = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, block]);

  const handleSubmit = async () => {
    showValidationErrors.value = true;
    if (!isValid.value) return;
    submitError.value = null;
    try {
      await onSubmit({
        teacherId: teacherId.value,
        dayOfWeek: dayOfWeek.value,
        startMinutes: startMinutes.value as number,
        endMinutes: endMinutes.value as number,
        label: label.value || undefined,
      });
      onClose();
    } catch (error) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to save block';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEdit ? 'Edit Lesson Block' : 'Add Lesson Block'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          <FormControl fullWidth error={!!getFieldError('teacherId')}>
            <InputLabel>Teacher</InputLabel>
            <Select
              value={teacherId.value}
              label="Teacher"
              disabled={isEdit}
              onChange={(e) => (teacherId.value = e.target.value)}
            >
              {instructors.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {getFieldError('teacherId') ??
                (isEdit
                  ? 'A block’s teacher can’t be changed — delete and recreate.'
                  : 'Who teaches during this block.')}
            </FormHelperText>
          </FormControl>

          <FormControl fullWidth error={!!getFieldError('dayOfWeek')}>
            <InputLabel>Day of week</InputLabel>
            <Select
              value={dayOfWeek.value}
              label="Day of week"
              onChange={(e) => (dayOfWeek.value = Number(e.target.value))}
            >
              {WEEKDAY_LONG.map((name, idx) => (
                <MenuItem key={name} value={idx}>
                  {name}
                </MenuItem>
              ))}
            </Select>
            {getFieldError('dayOfWeek') && (
              <FormHelperText>{getFieldError('dayOfWeek')}</FormHelperText>
            )}
          </FormControl>

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TimePicker
                label="Start (ET)"
                value={startTime.value}
                onChange={(v) => (startTime.value = v)}
                slotProps={{ textField: { fullWidth: true } }}
              />
              <TimePicker
                label="End (ET)"
                value={endTime.value}
                onChange={(v) => (endTime.value = v)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    error: !!getFieldError('endMinutes'),
                    helperText: getFieldError('endMinutes') ?? undefined,
                  },
                }}
              />
            </Box>
          </LocalizationProvider>

          <TextField
            label="Label"
            value={label.value}
            onChange={(e) => (label.value = e.target.value)}
            error={!!getFieldError('label')}
            helperText={
              getFieldError('label') ?? 'Optional, e.g. “Tuesday afternoons”'
            }
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
