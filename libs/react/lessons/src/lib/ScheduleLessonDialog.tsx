'use client';

/**
 * ScheduleLessonDialog — create a single first-lesson booking OR a
 * recurring series with preview + per-date skip checkboxes.
 *
 * Signals idiom (matches post-#287 pattern): `useSignals()` runtime hook,
 * `useSignal` per field, `useComputed` for derived state (preview dates,
 * validation errors).
 */

import { useCallback, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import type {
  CreateLessonInput,
  CreateLessonSeriesInput,
  Instructor,
  Room,
} from '@maple/ts/domain';
import { ROOMS, getRoomLabel } from '@maple/ts/domain';
import {
  lessonSeriesValidation,
  lessonValidation,
} from '@maple/ts/validation';
import {
  batch,
  useComputed,
  useSignal,
  useSignals,
} from '@maple/react/signals';
import { RoomAvailability } from '@maple/react/rooms';
import {
  generateWeeklyDates,
  type SeriesCadence,
} from './series-dates';

type Mode = 'single' | 'series';
type EndType = 'count' | 'date';

interface ScheduleLessonDialogProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  /** Default teacher (student's primary teacher). Can be overridden per lesson. */
  defaultTeacherId: string;
  /** For the teacher dropdown. */
  instructors: Instructor[];
  /** Default lesson length in minutes (30, 45, 60). */
  defaultDurationMinutes?: 30 | 45 | 60;
  onCreateSingle: (input: CreateLessonInput) => Promise<unknown>;
  onCreateSeries: (input: CreateLessonSeriesInput) => Promise<unknown>;
  isSubmitting?: boolean;
}

const DURATION_OPTIONS = [30, 45, 60] as const;

function startOfNextHour(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next;
}

function formatPreviewDate(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ScheduleLessonDialog({
  open,
  onClose,
  studentId,
  defaultTeacherId,
  instructors,
  defaultDurationMinutes = 30,
  onCreateSingle,
  onCreateSeries,
  isSubmitting = false,
}: ScheduleLessonDialogProps) {
  useSignals();

  // ============================================================
  // SHARED FIELDS
  // ============================================================
  const mode = useSignal<Mode>('single');
  const teacherId = useSignal(defaultTeacherId);
  const durationMinutes = useSignal<30 | 45 | 60>(defaultDurationMinutes);
  const room = useSignal<Room>('spruce');
  const notes = useSignal('');

  // Single-mode
  const scheduledAt = useSignal<Date>(startOfNextHour());

  // Series-mode
  const seriesStart = useSignal<Date>(startOfNextHour());
  const cadence = useSignal<SeriesCadence>('weekly');
  const endType = useSignal<EndType>('count');
  const count = useSignal<number>(8);
  const endDate = useSignal<Date>(
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 60);
      return d;
    })()
  );
  /** Per-previewed-date skip flag, keyed by ISO timestamp. */
  const skipped = useSignal<Record<string, boolean>>({});

  // UI state
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  // ============================================================
  // RESET ON OPEN
  // ============================================================
  useEffect(() => {
    if (!open) return;
    batch(() => {
      mode.value = 'single';
      teacherId.value = defaultTeacherId;
      durationMinutes.value = defaultDurationMinutes;
      room.value = 'spruce';
      notes.value = '';
      scheduledAt.value = startOfNextHour();
      seriesStart.value = startOfNextHour();
      cadence.value = 'weekly';
      endType.value = 'count';
      count.value = 8;
      const d = new Date();
      d.setDate(d.getDate() + 60);
      endDate.value = d;
      skipped.value = {};
      showValidationErrors.value = false;
      submitError.value = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTeacherId, defaultDurationMinutes]);

  // ============================================================
  // SERIES PREVIEW (derived)
  // ============================================================
  const previewDates = useComputed(() => {
    if (mode.value !== 'series') return [] as Date[];
    return generateWeeklyDates({
      start: seriesStart.value,
      cadence: cadence.value,
      count: endType.value === 'count' ? count.value : undefined,
      end: endType.value === 'date' ? endDate.value : undefined,
    });
  });

  const keptDates = useComputed(() =>
    previewDates.value.filter(
      (d) => !skipped.value[d.toISOString()]
    )
  );

  // ============================================================
  // VALIDATION (per-mode)
  // ============================================================
  const singleValidation = useComputed(() =>
    lessonValidation({
      studentId,
      teacherId: teacherId.value,
      scheduledAt: scheduledAt.value,
      durationMinutes: durationMinutes.value,
      status: 'scheduled',
      notes: notes.value || undefined,
    })
  );

  const seriesVal = useComputed(() =>
    lessonSeriesValidation({
      studentId,
      teacherId: teacherId.value,
      durationMinutes: durationMinutes.value,
      scheduledAts: keptDates.value,
      notes: notes.value || undefined,
    })
  );

  const isValid = useComputed(() =>
    mode.value === 'single'
      ? singleValidation.value.isValid()
      : seriesVal.value.isValid()
  );

  const errorFor = (field: string): string | null => {
    if (!showValidationErrors.value) return null;
    const errs =
      mode.value === 'single'
        ? singleValidation.value.getErrors(field)
        : seriesVal.value.getErrors(field);
    return errs?.[0] ?? null;
  };

  // ============================================================
  // SUBMIT
  // ============================================================
  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;

    if (!isValid.value) return;
    if (isSubmitting) return;

    submitError.value = null;

    try {
      if (mode.value === 'single') {
        const input: CreateLessonInput = {
          studentId,
          teacherId: teacherId.value,
          scheduledAt: scheduledAt.value,
          durationMinutes: durationMinutes.value,
          room: room.value,
          status: 'scheduled',
          notes: notes.value || undefined,
        };
        await onCreateSingle(input);
      } else {
        const input: CreateLessonSeriesInput = {
          studentId,
          teacherId: teacherId.value,
          durationMinutes: durationMinutes.value,
          scheduledAts: keptDates.value,
          room: room.value,
          notes: notes.value || undefined,
        };
        await onCreateSeries(input);
      }
      onClose();
    } catch (error: unknown) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to schedule lessons';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitting, studentId, onCreateSingle, onCreateSeries, onClose]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Schedule lessons</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          <ToggleButtonGroup
            exclusive
            fullWidth
            value={mode.value}
            onChange={(_, next) => {
              if (next) mode.value = next as Mode;
            }}
            aria-label="Schedule mode"
          >
            <ToggleButton value="single" aria-label="Single lesson">
              Single lesson
            </ToggleButton>
            <ToggleButton value="series" aria-label="Recurring series">
              Recurring series
            </ToggleButton>
          </ToggleButtonGroup>

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {mode.value === 'single' ? (
              <>
                <DateTimePicker
                  label="Date & time"
                  value={scheduledAt.value}
                  onChange={(v) => {
                    if (v) scheduledAt.value = v;
                  }}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      required: true,
                      error: !!errorFor('scheduledAt'),
                      helperText: errorFor('scheduledAt') ?? undefined,
                    },
                  }}
                />
                {/* Lessons occupy the Spruce Room — surface that day's
                    availability and warn (non-blocking) on overlaps. */}
                <RoomAvailability
                  room={room.value}
                  start={scheduledAt.value}
                  end={
                    new Date(
                      scheduledAt.value.getTime() +
                        durationMinutes.value * 60_000
                    )
                  }
                />
              </>
            ) : (
              <>
                <DateTimePicker
                  label="Series start (date & time)"
                  value={seriesStart.value}
                  onChange={(v) => {
                    if (v) seriesStart.value = v;
                  }}
                  slotProps={{
                    textField: { fullWidth: true, required: true },
                  }}
                />
                <FormControl fullWidth>
                  <InputLabel id="cadence-label">Cadence</InputLabel>
                  <Select
                    labelId="cadence-label"
                    label="Cadence"
                    value={cadence.value}
                    onChange={(e) =>
                      (cadence.value = e.target.value as SeriesCadence)
                    }
                  >
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="biweekly">Every other week</MenuItem>
                  </Select>
                </FormControl>
                <FormControl>
                  <RadioGroup
                    row
                    value={endType.value}
                    onChange={(e) =>
                      (endType.value = e.target.value as EndType)
                    }
                  >
                    <FormControlLabel
                      value="count"
                      control={<Radio />}
                      label="Number of sessions"
                    />
                    <FormControlLabel
                      value="date"
                      control={<Radio />}
                      label="End on date"
                    />
                  </RadioGroup>
                </FormControl>
                {endType.value === 'count' ? (
                  <TextField
                    label="Number of sessions"
                    type="number"
                    value={count.value}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      count.value = Number.isFinite(n) ? n : 0;
                    }}
                    inputProps={{ min: 1, max: 260 }}
                    fullWidth
                  />
                ) : (
                  <DateTimePicker
                    label="End date"
                    value={endDate.value}
                    onChange={(v) => {
                      if (v) endDate.value = v;
                    }}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                )}
              </>
            )}
          </LocalizationProvider>

          <FormControl fullWidth error={!!errorFor('teacherId')}>
            <InputLabel id="teacher-label">Teacher</InputLabel>
            <Select
              labelId="teacher-label"
              label="Teacher"
              value={teacherId.value}
              onChange={(e) => (teacherId.value = e.target.value)}
            >
              {instructors.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.name}
                  {i.id === defaultTeacherId ? ' (primary)' : ''}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {errorFor('teacherId') ??
                'Override for a substitute on a one-off lesson.'}
            </FormHelperText>
          </FormControl>

          <FormControl fullWidth error={!!errorFor('durationMinutes')}>
            <InputLabel id="duration-label">Duration</InputLabel>
            <Select
              labelId="duration-label"
              label="Duration"
              value={durationMinutes.value}
              onChange={(e) =>
                (durationMinutes.value = e.target.value as 30 | 45 | 60)
              }
            >
              {DURATION_OPTIONS.map((d) => (
                <MenuItem key={d} value={d}>
                  {d} minutes
                </MenuItem>
              ))}
            </Select>
            {errorFor('durationMinutes') && (
              <FormHelperText>{errorFor('durationMinutes')}</FormHelperText>
            )}
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="room-label">Room</InputLabel>
            <Select
              labelId="room-label"
              label="Room"
              value={room.value}
              onChange={(e) => (room.value = e.target.value as Room)}
            >
              {ROOMS.map((r) => (
                <MenuItem key={r} value={r}>
                  {getRoomLabel(r)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Notes"
            value={notes.value}
            onChange={(e) => (notes.value = e.target.value)}
            multiline
            rows={2}
            fullWidth
            helperText={errorFor('notes') ?? 'Optional'}
            error={!!errorFor('notes')}
          />

          {mode.value === 'series' && (
            <>
              <Divider />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="overline" color="text.secondary">
                  Preview ({keptDates.value.length} of{' '}
                  {previewDates.value.length})
                </Typography>
                <Chip
                  label={`Will create ${keptDates.value.length} lesson${
                    keptDates.value.length === 1 ? '' : 's'
                  }`}
                  color="primary"
                  size="small"
                />
              </Box>
              {previewDates.value.length === 0 ? (
                <Alert severity="warning">
                  No dates generated. Check the start date, cadence, and end.
                </Alert>
              ) : (
                <Box
                  sx={{
                    maxHeight: 260,
                    overflowY: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  {previewDates.value.map((d) => {
                    const key = d.toISOString();
                    const isSkipped = !!skipped.value[key];
                    return (
                      <Box
                        key={key}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1,
                          py: 0.5,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          '&:last-of-type': { borderBottom: 'none' },
                          opacity: isSkipped ? 0.5 : 1,
                          textDecoration: isSkipped ? 'line-through' : 'none',
                        }}
                      >
                        <Checkbox
                          checked={!isSkipped}
                          onChange={(e) => {
                            skipped.value = {
                              ...skipped.value,
                              [key]: !e.target.checked,
                            };
                          }}
                          inputProps={{
                            'aria-label': `Include ${formatPreviewDate(d)}`,
                          }}
                        />
                        <Typography variant="body2">
                          {formatPreviewDate(d)}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}
              {showValidationErrors.value &&
                errorFor('scheduledAts') && (
                  <Alert severity="error">{errorFor('scheduledAts')}</Alert>
                )}
            </>
          )}
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
          {isSubmitting
            ? 'Saving...'
            : mode.value === 'single'
              ? 'Schedule lesson'
              : `Schedule ${keptDates.value.length} lesson${
                  keptDates.value.length === 1 ? '' : 's'
                }`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
