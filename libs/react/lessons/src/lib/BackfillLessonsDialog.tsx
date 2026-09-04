'use client';

/**
 * Record lessons that have already been taught (#799).
 *
 * Nathan has been teaching a Hope-covered guitar student with nothing recorded
 * anywhere, and Hope pays backwards — so every lesson entered here is claimable
 * revenue that currently exists only in someone's memory. Entering a term one
 * lesson at a time is exactly the friction that stops it happening.
 *
 * This produces **ordinary rendered `Lesson` records**, deliberately: payouts,
 * the Hope queue and the room schedule all read lessons, and a parallel
 * "historical lesson" shape would have to be taught to every one of them.
 *
 * Backfilled lessons carry no block. That is not an oversight — the block rule
 * (#686) stops *new* lessons being dropped at arbitrary times, and a lesson that
 * already happened happened whether or not a block covers that weekday. They
 * surface as "needs a block" for an admin to tidy, the same grandfather path
 * pre-block lessons already use.
 */

import { useMemo, useState } from 'react';
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
import type { Instructor, Student } from '@maple/ts/domain';
import { generateWeeklyDates, type SeriesCadence } from './series-dates';

export interface BackfillLessonsDialogProps {
  open: boolean;
  students: Student[];
  instructors: Instructor[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    studentId: string;
    teacherId: string;
    durationMinutes: number;
    scheduledAts: Date[];
  }) => void;
}

/** Parse a `datetime-local` value as local wall-clock time. */
function parseLocal(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function BackfillLessonsDialog({
  open,
  students,
  instructors,
  isSubmitting = false,
  onClose,
  onSubmit,
}: BackfillLessonsDialogProps) {
  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [firstLesson, setFirstLesson] = useState('');
  const [cadence, setCadence] = useState<SeriesCadence>('weekly');
  const [count, setCount] = useState(4);

  const start = parseLocal(firstLesson);

  const dates = useMemo(() => {
    if (!start) return [];
    return generateWeeklyDates({ start, cadence, count });
  }, [start, cadence, count]);

  const now = new Date();
  const futureDates = dates.filter((d) => d.getTime() > now.getTime());
  const canSubmit =
    Boolean(studentId) &&
    Boolean(teacherId) &&
    dates.length > 0 &&
    futureDates.length === 0 &&
    !isSubmitting;

  const reset = () => {
    setStudentId('');
    setTeacherId('');
    setFirstLesson('');
    setCount(4);
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Record lessons already taught</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Creates rendered lessons in the past, so they can be claimed and so
          teacher payouts are right. Use this for teaching that happened before
          it was being recorded.
        </Typography>

        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel id="backfill-student">Student</InputLabel>
            <Select
              labelId="backfill-student"
              label="Student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {students.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                  {s.isHopeScholarship ? ' (Hope)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="backfill-teacher">Teacher</InputLabel>
            <Select
              labelId="backfill-teacher"
              label="Teacher"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              {instructors.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="backfill-duration">Lesson length</InputLabel>
            <Select
              labelId="backfill-duration"
              label="Lesson length"
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

          <TextField
            label="First lesson"
            type="datetime-local"
            value={firstLesson}
            onChange={(e) => setFirstLesson(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />

          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="backfill-cadence">Repeats</InputLabel>
              <Select
                labelId="backfill-cadence"
                label="Repeats"
                value={cadence}
                onChange={(e) => setCadence(e.target.value as SeriesCadence)}
              >
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="biweekly">Every other week</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="How many"
              type="number"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              inputProps={{ min: 1, max: 52 }}
              fullWidth
            />
          </Stack>

          {futureDates.length > 0 && (
            <Alert severity="error">
              {futureDates.length} of these dates {futureDates.length === 1 ? 'is' : 'are'} in the
              future. This records lessons that already happened — schedule
              upcoming lessons the usual way instead.
            </Alert>
          )}

          {dates.length > 0 && futureDates.length === 0 && (
            <Alert severity="info">
              Will record <strong>{dates.length}</strong> rendered lesson
              {dates.length === 1 ? '' : 's'}, from{' '}
              {dates[0].toLocaleDateString()} to{' '}
              {dates[dates.length - 1].toLocaleDateString()}. They will be
              flagged &ldquo;needs a block&rdquo; until someone attributes them.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({ studentId, teacherId, durationMinutes, scheduledAts: dates })
          }
        >
          {isSubmitting ? 'Recording…' : `Record ${dates.length || ''} lessons`.trim()}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
