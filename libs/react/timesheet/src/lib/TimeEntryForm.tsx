'use client';

import { useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  Stack,
  Alert,
  Paper,
  Typography,
} from '@mui/material';
import { timeEntryValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  useSignals,
} from '@maple/react/signals';
import { todayIso } from './format';

export interface TimeEntryFormProps {
  /** UID of the employee these hours are for. */
  employeeId: string;
  onSubmit: (input: {
    employeeId: string;
    date: string;
    hours: number;
    notes?: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
}

/**
 * Inline form for logging hours. No dialog — the employee timesheet
 * page renders this directly above the entries list.
 */
export function TimeEntryForm({
  employeeId,
  onSubmit,
  isSubmitting = false,
}: TimeEntryFormProps) {
  useSignals();

  const date = useSignal(todayIso());
  const hours = useSignal<string>('');
  const notes = useSignal('');
  const showErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const validation = useComputed(() => {
    const parsedHours = parseFloat(hours.value);
    return timeEntryValidation({
      employeeId,
      date: date.value,
      hours: Number.isFinite(parsedHours) ? parsedHours : undefined,
      notes: notes.value || undefined,
    });
  });

  const errors = useComputed<Record<string, string[]>>(() =>
    showErrors.value ? validation.value.getErrors() : {}
  );

  const fieldError = (field: string) => errors.value[field]?.[0] ?? null;

  const handleSubmit = useCallback(async () => {
    showErrors.value = true;
    submitError.value = null;

    if (validation.value.hasErrors()) return;

    const parsedHours = parseFloat(hours.value);
    try {
      await onSubmit({
        employeeId,
        date: date.value,
        hours: parsedHours,
        notes: notes.value || undefined,
      });
      // Reset for the next entry
      hours.value = '';
      notes.value = '';
      showErrors.value = false;
    } catch (e) {
      submitError.value =
        e instanceof Error ? e.message : 'Failed to log time entry';
    }
  }, [
    onSubmit,
    employeeId,
    // signals mutated via .value — no need to depend on them
  ]);

  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Log hours
      </Typography>
      <Stack spacing={2}>
        {submitError.value && (
          <Alert severity="error" onClose={() => (submitError.value = null)}>
            {submitError.value}
          </Alert>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 2fr' },
            gap: 2,
          }}
        >
          <TextField
            label="Date"
            type="date"
            value={date.value}
            onChange={(e) => (date.value = e.target.value)}
            error={!!fieldError('date')}
            helperText={fieldError('date')}
            slotProps={{ inputLabel: { shrink: true } }}
            required
          />
          <TextField
            label="Hours"
            type="number"
            value={hours.value}
            onChange={(e) => (hours.value = e.target.value)}
            error={!!fieldError('hours')}
            helperText={fieldError('hours')}
            slotProps={{ htmlInput: { step: 0.25, min: 0, max: 24 } }}
            required
          />
          <TextField
            label="Notes"
            value={notes.value}
            onChange={(e) => (notes.value = e.target.value)}
            error={!!fieldError('notes')}
            helperText={fieldError('notes') || 'Optional'}
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Log entry'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
