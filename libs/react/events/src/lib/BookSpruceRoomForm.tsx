'use client';

import { useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import type { CreateCalendarEventInput, Room } from '@maple/ts/domain';
import { getRoomLabel } from '@maple/ts/domain';
import { calendarEventValidation } from '@maple/ts/validation';
import { useSignal, useComputed, batch, useSignals } from '@maple/react/signals';

const ROOM: Room = 'spruce';

/** Combine the Y/M/D of `date` with the H/M of `time` into one Date. */
function combineDateTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

interface BookSpruceRoomFormProps {
  onSubmit: (input: CreateCalendarEventInput) => Promise<void>;
  isSubmitting?: boolean;
}

/**
 * Quick form for reserving the Spruce Room for ad-hoc use (Music Together,
 * a private rental, a one-off event). Creates a CalendarEvent with
 * `room: 'spruce'` and `public: false` by default — so it blocks the room
 * across the portal without showing up on the public site calendar (it can
 * be flipped public, e.g. for Music Together).
 *
 * Conflict warnings against existing bookings are deliberately out of scope
 * here — they ship with the day-strip work and cover all scheduling flows.
 */
export function BookSpruceRoomForm({
  onSubmit,
  isSubmitting = false,
}: BookSpruceRoomFormProps) {
  useSignals();

  // Defaults: next top of the hour today, a one-hour block.
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setHours(now.getHours() + 1, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultStart.getHours() + 1);

  const title = useSignal('');
  const date = useSignal<Date>(defaultStart);
  const startTime = useSignal<Date>(defaultStart);
  const endTime = useSignal<Date>(defaultEnd);
  const repeatWeekly = useSignal(false);
  const isPublic = useSignal(false);

  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const startDateTime = useComputed(() =>
    combineDateTime(date.value, startTime.value)
  );
  const endDateTime = useComputed(() =>
    combineDateTime(date.value, endTime.value)
  );

  const buildInput = useCallback(
    (): CreateCalendarEventInput => ({
      title: title.value.trim(),
      description: '',
      startDateTime: startDateTime.value,
      endDateTime: endDateTime.value,
      recurrenceRule: repeatWeekly.value ? 'FREQ=WEEKLY' : null,
      location: getRoomLabel(ROOM),
      type: 'event',
      public: isPublic.value,
      room: ROOM,
      sourceRef: null,
      createdBy: '',
    }),
    // signal .value reads are tracked by the computed/handlers that call this
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const validation = useComputed(() => calendarEventValidation(buildInput()));

  const errors = useComputed<Record<string, string[]>>(() =>
    showValidationErrors.value ? validation.value.getErrors() : {}
  );
  const isValid = useComputed(() => validation.value.isValid());
  const getFieldError = (field: string): string | null =>
    errors.value[field]?.[0] ?? null;

  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;
    if (!isValid.value) return;

    submitError.value = null;
    try {
      await onSubmit(buildInput());
      // Reset the obvious fields on success; keep date/times so a user can
      // book several adjacent slots quickly.
      batch(() => {
        title.value = '';
        repeatWeekly.value = false;
        isPublic.value = false;
        showValidationErrors.value = false;
      });
    } catch (error) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to book the room';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSubmit]);

  return (
    <Card variant="outlined">
      <CardContent>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Stack spacing={2}>
            {submitError.value && (
              <Alert severity="error">{submitError.value}</Alert>
            )}

            <TextField
              label="What's the booking?"
              placeholder="e.g. Music Together, private rental"
              value={title.value}
              onChange={(e) => (title.value = e.target.value)}
              error={!!getFieldError('title')}
              helperText={getFieldError('title')}
              required
              fullWidth
            />

            <DatePicker
              label="Date"
              value={date.value}
              onChange={(newValue) => {
                if (newValue) date.value = newValue;
              }}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TimePicker
                label="Start time"
                value={startTime.value}
                onChange={(newValue) => {
                  if (newValue) startTime.value = newValue;
                }}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    error: !!getFieldError('startDateTime'),
                    helperText: getFieldError('startDateTime'),
                  },
                }}
              />
              <TimePicker
                label="End time"
                value={endTime.value}
                onChange={(newValue) => {
                  if (newValue) endTime.value = newValue;
                }}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    error: !!getFieldError('endDateTime'),
                    helperText: getFieldError('endDateTime'),
                  },
                }}
              />
            </Box>

            <FormControlLabel
              control={
                <Checkbox
                  checked={repeatWeekly.value}
                  onChange={(e) => (repeatWeekly.value = e.target.checked)}
                />
              }
              label="Repeat weekly"
            />

            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={isPublic.value}
                    onChange={(e) => (isPublic.value = e.target.checked)}
                  />
                }
                label="Show on the public calendar"
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Off by default — the booking still blocks the room internally.
                Turn on for things the public should see (e.g. Music Together).
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Booking…' : 'Book the room'}
              </Button>
            </Box>
          </Stack>
        </LocalizationProvider>
      </CardContent>
    </Card>
  );
}
