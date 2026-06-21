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
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import type {
  CalendarEvent,
  CalendarEventType,
  CreateCalendarEventInput,
  Room,
} from '@maple/ts/domain';
import {
  CALENDAR_EVENT_TYPES,
  DEFAULT_EVENT_LOCATION,
  getCalendarEventTypeLabel,
  getRoomLabel,
  ROOMS,
} from '@maple/ts/domain';
import { calendarEventValidation } from '@maple/ts/validation';
import { RoomAvailability } from './RoomAvailability';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

interface CalendarEventFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCalendarEventInput) => Promise<void>;
  calendarEvent?: CalendarEvent;
  isSubmitting?: boolean;
}

/**
 * Common recurrence presets
 */
const RECURRENCE_PRESETS = [
  { label: 'One-time (no recurrence)', value: '' },
  { label: 'Weekly', value: 'FREQ=WEEKLY' },
  { label: 'Biweekly', value: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Monthly', value: 'FREQ=MONTHLY' },
  { label: 'Custom', value: 'custom' },
] as const;

export function CalendarEventForm({
  open,
  onClose,
  onSubmit,
  calendarEvent,
  isSubmitting = false,
}: CalendarEventFormProps) {
  useSignals();

  // Form field signals
  const title = useSignal('');
  const description = useSignal('');
  const startDateTime = useSignal<Date>(new Date());
  const endDateTime = useSignal<Date>(new Date());
  const recurrencePreset = useSignal('');
  const recurrenceRule = useSignal('');
  const location = useSignal(DEFAULT_EVENT_LOCATION);
  const type = useSignal<CalendarEventType>('event');
  const isPublic = useSignal(true);
  const room = useSignal<Room | null>(null);

  // UI state signals
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const isEdit = !!calendarEvent;

  // Validation
  const validation = useComputed(() => {
    const effectiveRecurrence =
      recurrencePreset.value === 'custom'
        ? recurrenceRule.value
        : recurrencePreset.value || null;

    return calendarEventValidation({
      title: title.value,
      description: description.value,
      startDateTime: startDateTime.value,
      endDateTime: endDateTime.value,
      recurrenceRule: effectiveRecurrence,
      location: location.value,
      type: type.value,
      public: isPublic.value,
      room: room.value,
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

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) return;

    if (calendarEvent) {
      // Editing an existing event
      const matchingPreset = RECURRENCE_PRESETS.find(
        (p) => p.value === calendarEvent.recurrenceRule
      );

      batch(() => {
        title.value = calendarEvent.title;
        description.value = calendarEvent.description;
        startDateTime.value =
          calendarEvent.startDateTime instanceof Date
            ? calendarEvent.startDateTime
            : new Date(calendarEvent.startDateTime);
        endDateTime.value =
          calendarEvent.endDateTime instanceof Date
            ? calendarEvent.endDateTime
            : new Date(calendarEvent.endDateTime);

        if (calendarEvent.recurrenceRule === null || calendarEvent.recurrenceRule === '') {
          recurrencePreset.value = '';
          recurrenceRule.value = '';
        } else if (matchingPreset && matchingPreset.value !== 'custom') {
          recurrencePreset.value = calendarEvent.recurrenceRule;
          recurrenceRule.value = '';
        } else {
          recurrencePreset.value = 'custom';
          recurrenceRule.value = calendarEvent.recurrenceRule ?? '';
        }

        location.value = calendarEvent.location;
        type.value = calendarEvent.type;
        isPublic.value = calendarEvent.public;
        room.value = calendarEvent.room ?? null;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      // Defaults for new event
      const defaultStart = new Date();
      defaultStart.setHours(defaultStart.getHours() + 24);
      defaultStart.setMinutes(0, 0, 0);

      const defaultEnd = new Date(defaultStart);
      defaultEnd.setHours(defaultEnd.getHours() + 2);

      batch(() => {
        title.value = '';
        description.value = '';
        startDateTime.value = defaultStart;
        endDateTime.value = defaultEnd;
        recurrencePreset.value = '';
        recurrenceRule.value = '';
        location.value = DEFAULT_EVENT_LOCATION;
        type.value = 'event';
        isPublic.value = true;
        room.value = null;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, calendarEvent]);

  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;

    if (!isValid.value) {
      return;
    }

    submitError.value = null;

    const effectiveRecurrence =
      recurrencePreset.value === 'custom'
        ? recurrenceRule.value
        : recurrencePreset.value || null;

    try {
      await onSubmit({
        title: title.value,
        description: description.value,
        startDateTime: startDateTime.value,
        endDateTime: endDateTime.value,
        recurrenceRule: effectiveRecurrence,
        location: location.value,
        type: type.value,
        public: isPublic.value,
        room: room.value,
        sourceRef: calendarEvent?.sourceRef ?? null,
        createdBy: calendarEvent?.createdBy ?? '',
      });
    } catch (error) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to save event';
    }
  }, [onSubmit, calendarEvent]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEdit ? 'Edit Calendar Event' : 'Add Calendar Event'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error">{submitError.value}</Alert>
          )}

          {/* Title */}
          <TextField
            label="Title"
            value={title.value}
            onChange={(e) => (title.value = e.target.value)}
            error={!!getFieldError('title')}
            helperText={getFieldError('title')}
            required
            fullWidth
          />

          {/* Description */}
          <TextField
            label="Description"
            value={description.value}
            onChange={(e) => (description.value = e.target.value)}
            error={!!getFieldError('description')}
            helperText={getFieldError('description')}
            multiline
            rows={3}
            fullWidth
          />

          {/* Event Type */}
          <FormControl fullWidth error={!!getFieldError('type')}>
            <InputLabel id="event-type-label">Event Type</InputLabel>
            <Select
              labelId="event-type-label"
              value={type.value}
              label="Event Type"
              onChange={(e) =>
                (type.value = e.target.value as CalendarEventType)
              }
            >
              {CALENDAR_EVENT_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {getCalendarEventTypeLabel(t)}
                </MenuItem>
              ))}
            </Select>
            {getFieldError('type') && (
              <FormHelperText>{getFieldError('type')}</FormHelperText>
            )}
          </FormControl>

          {/* Start Date/Time */}
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DateTimePicker
              label="Start Date & Time"
              value={startDateTime.value}
              onChange={(newValue) => {
                if (newValue) {
                  startDateTime.value = newValue;
                  // Auto-advance end time if start is after end
                  if (newValue >= endDateTime.value) {
                    const newEnd = new Date(newValue);
                    newEnd.setHours(newEnd.getHours() + 2);
                    endDateTime.value = newEnd;
                  }
                }
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  error: !!getFieldError('startDateTime'),
                  helperText: getFieldError('startDateTime'),
                  required: true,
                },
              }}
            />

            {/* End Date/Time */}
            <DateTimePicker
              label="End Date & Time"
              value={endDateTime.value}
              onChange={(newValue) => {
                if (newValue) {
                  endDateTime.value = newValue;
                }
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  error: !!getFieldError('endDateTime'),
                  helperText: getFieldError('endDateTime'),
                  required: true,
                },
              }}
            />
          </LocalizationProvider>

          {/* Recurrence */}
          <FormControl fullWidth>
            <InputLabel id="recurrence-label">Recurrence</InputLabel>
            <Select
              labelId="recurrence-label"
              value={recurrencePreset.value}
              label="Recurrence"
              onChange={(e) => (recurrencePreset.value = e.target.value)}
            >
              {RECURRENCE_PRESETS.map((preset) => (
                <MenuItem key={preset.value} value={preset.value}>
                  {preset.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Custom RRULE input */}
          {recurrencePreset.value === 'custom' && (
            <TextField
              label="Custom RRULE"
              value={recurrenceRule.value}
              onChange={(e) => (recurrenceRule.value = e.target.value)}
              error={!!getFieldError('recurrenceRule')}
              helperText={
                getFieldError('recurrenceRule') ||
                'RFC 5545 RRULE, e.g. FREQ=WEEKLY;BYDAY=FR'
              }
              fullWidth
              placeholder="FREQ=WEEKLY;BYDAY=FR"
            />
          )}

          {/* Location */}
          <TextField
            label="Location"
            value={location.value}
            onChange={(e) => (location.value = e.target.value)}
            error={!!getFieldError('location')}
            helperText={getFieldError('location')}
            fullWidth
          />

          {/* Room */}
          <FormControl fullWidth>
            <InputLabel id="event-room-label">Room</InputLabel>
            <Select
              labelId="event-room-label"
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
              Set this if the event occupies a bookable room — it blocks the
              room and flags conflicts.
            </FormHelperText>
          </FormControl>

          {/* Room availability for the picked slot */}
          {room.value && (
            <RoomAvailability
              room={room.value}
              start={startDateTime.value}
              end={endDateTime.value}
              ignoreEventId={calendarEvent?.id}
            />
          )}

          {/* Public Toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={isPublic.value}
                onChange={(e) => (isPublic.value = e.target.checked)}
              />
            }
            label="Public (visible on calendar and in ICS feeds)"
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
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
