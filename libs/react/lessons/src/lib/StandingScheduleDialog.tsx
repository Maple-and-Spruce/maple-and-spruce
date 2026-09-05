'use client';

/**
 * Create or change a standing arrangement (#797).
 *
 * The point of this dialog is that moving a student to a new day is **one
 * edit**, not twelve. It edits the arrangement, never the lessons already on
 * the calendar.
 *
 * The block is not a detail to be filled in — it is the container the
 * arrangement has to sit inside (#686), and the server rejects a schedule that
 * does not fit. So the form narrows to the chosen teacher's blocks, and derives
 * the weekday from the block rather than asking twice: a block already *is* a
 * weekday and a window.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type {
  Instructor,
  LessonBlock,
  Room,
  StudentLessonSchedule,
} from '@maple/ts/domain';
import {
  SCHEDULE_TIME_ZONE,
  WEEKDAY_LONG,
  zonedDateKey,
  zonedWallClockToInstant,
} from '@maple/ts/domain';
import { formatBlockOption, formatMinutes } from './block-format';

export interface StandingScheduleDialogProps {
  open: boolean;
  /** Present when changing an existing arrangement. */
  schedule?: StudentLessonSchedule;
  instructors: Instructor[];
  blocks: LessonBlock[];
  /** Falls back to this teacher for a new arrangement. */
  defaultTeacherId?: string;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: {
    teacherId: string;
    blockId: string;
    dayOfWeek: number;
    startMinutes: number;
    durationMinutes: number;
    room?: Room;
    startsOn: Date;
  }) => void;
}

/** `HH:MM` for a time input, from minutes-from-midnight. */
function toTimeValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function fromTimeValue(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * `YYYY-MM-DD` for a date input, read in the **shop** timezone.
 *
 * Not the browser's. `startsOn` is a date-only fact stored as a timestamp, so
 * reading it with local getters shifts it a day for anyone west of the stored
 * instant — and since this value is written straight back on save, an untouched
 * edit could quietly move a schedule's start date backwards. Everything else in
 * this feature reasons in shop time; so does this.
 */
function toDateValue(d: Date): string {
  return zonedDateKey(d, SCHEDULE_TIME_ZONE);
}

/** The inverse: a `YYYY-MM-DD` from the input, as midday shop time. */
function fromDateValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  // Midday, not midnight: a date-only value parked mid-afternoon cannot drift
  // across a day boundary through any later timezone conversion.
  return zonedWallClockToInstant(y, m, d, 12 * 60, SCHEDULE_TIME_ZONE);
}

export function StandingScheduleDialog({
  open,
  schedule,
  instructors,
  blocks,
  defaultTeacherId,
  isSubmitting = false,
  error = null,
  onClose,
  onSubmit,
}: StandingScheduleDialogProps) {
  const [teacherId, setTeacherId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [time, setTime] = useState('16:00');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [startsOn, setStartsOn] = useState(toDateValue(new Date()));

  // Re-seed whenever the dialog opens, so editing one arrangement then another
  // does not carry the first one's values across.
  useEffect(() => {
    if (!open) return;
    setTeacherId(schedule?.teacherId ?? defaultTeacherId ?? '');
    setBlockId(schedule?.blockId ?? '');
    setTime(toTimeValue(schedule?.startMinutes ?? 16 * 60));
    setDurationMinutes(schedule?.durationMinutes ?? 30);
    setStartsOn(toDateValue(schedule?.startsOn ?? new Date()));
  }, [open, schedule, defaultTeacherId]);

  const teacherBlocks = useMemo(
    () => blocks.filter((b) => b.teacherId === teacherId),
    [blocks, teacherId]
  );

  const block = teacherBlocks.find((b) => b.id === blockId);
  const startMinutes = fromTimeValue(time);

  // The same rule the server enforces, shown before saving rather than after.
  const fitsBlock =
    block !== undefined &&
    startMinutes >= block.startMinutes &&
    startMinutes + durationMinutes <= block.endMinutes;

  const canSubmit =
    Boolean(teacherId) && Boolean(blockId) && fitsBlock && !isSubmitting;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {schedule ? 'Change the standing schedule' : 'Add a standing slot'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {schedule
            ? 'Applies from here on. Lessons already on the calendar stay where they are.'
            : 'Lessons are kept on the books automatically from this pattern.'}
        </Typography>

        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel id="sched-teacher">Teacher</InputLabel>
            <Select
              labelId="sched-teacher"
              label="Teacher"
              value={teacherId}
              onChange={(e) => {
                setTeacherId(e.target.value);
                setBlockId(''); // a block belongs to one teacher
              }}
              disabled={Boolean(schedule)} // teacher is fixed; end it and make a new one
            >
              {instructors.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth disabled={!teacherId}>
            <InputLabel id="sched-block">Which block</InputLabel>
            <Select
              labelId="sched-block"
              label="Which block"
              value={blockId}
              onChange={(e) => setBlockId(e.target.value)}
            >
              {teacherBlocks.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.label
                    ? `${b.label} — ${formatBlockOption(b)}`
                    : formatBlockOption(b)}
                </MenuItem>
              ))}
            </Select>
            {teacherId && teacherBlocks.length === 0 && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                This teacher has no blocks yet. Create one first — a standing
                slot has to sit inside a block.
              </Typography>
            )}
          </FormControl>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Start time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="sched-duration">Length</InputLabel>
              <Select
                labelId="sched-duration"
                label="Length"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              >
                {[30, 45, 60].map((m) => (
                  <MenuItem key={m} value={m}>
                    {m} minutes
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <TextField
            label={schedule ? 'In effect from' : 'Starting'}
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />

          {block && !fitsBlock && (
            <Alert severity="error">
              {formatMinutes(startMinutes)} for {durationMinutes} minutes does
              not fit inside{' '}
              {formatMinutes(block.startMinutes)}–
              {formatMinutes(block.endMinutes)}. Pick another time, or a
              different block.
            </Alert>
          )}

          {block && fitsBlock && (
            <Alert severity="success">
              {WEEKDAY_LONG[block.dayOfWeek]}s at{' '}
              {formatMinutes(startMinutes)}, {durationMinutes} minutes. Lessons
              will be kept on the books twelve weeks ahead.
            </Alert>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              teacherId,
              blockId,
              // The block already is a weekday; asking twice invites them to
              // disagree, and the server would reject the result.
              dayOfWeek: block?.dayOfWeek ?? 0,
              startMinutes,
              durationMinutes,
              room: schedule?.room,
              startsOn: fromDateValue(startsOn),
            })
          }
        >
          {isSubmitting ? 'Saving…' : schedule ? 'Save change' : 'Add slot'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
