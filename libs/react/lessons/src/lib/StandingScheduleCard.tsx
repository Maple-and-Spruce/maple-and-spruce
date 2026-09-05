'use client';

/**
 * A student's standing arrangement (#797).
 *
 * This is what Katie and Nathan actually think in — "Tuesdays at 4:00, thirty
 * minutes, with Nathan" — and what they now edit. Before this, the same fact
 * existed only as twelve rows of concrete lessons, so moving a student to a new
 * day meant editing every one of them.
 *
 * Changing the arrangement is **one edit**, and it deliberately does not
 * rewrite lessons already on the books: some are taught, invoiced, or paid. The
 * new pattern applies going forward. The card says so, because "I changed the
 * day and next week didn't move" is otherwise a confusing surprise.
 */

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import type { Instructor, StudentLessonSchedule } from '@maple/ts/domain';
import { SCHEDULE_TIME_ZONE, WEEKDAY_LONG } from '@maple/ts/domain';
import { formatMinutes } from './block-format';

export interface StandingScheduleCardProps {
  schedules: StudentLessonSchedule[];
  instructors: Instructor[];
  /** Id of the schedule currently saving, if any. */
  pendingId?: string | null;
  onAdd: () => void;
  onEdit: (schedule: StudentLessonSchedule) => void;
  onEnd: (schedule: StudentLessonSchedule) => void;
}

/** "Tuesdays at 4:00 PM" — how a person says it out loud. */
export function describeSchedule(
  schedule: Pick<StudentLessonSchedule, 'dayOfWeek' | 'startMinutes'>
): string {
  return `${WEEKDAY_LONG[schedule.dayOfWeek]}s at ${formatMinutes(schedule.startMinutes)}`;
}

/**
 * Dates here are date-only facts stored as timestamps, so they are read in the
 * shop timezone rather than the viewer's — otherwise the same schedule shows a
 * different start date depending on where you open it from.
 */
function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

export function StandingScheduleCard({
  schedules,
  instructors,
  pendingId = null,
  onAdd,
  onEdit,
  onEnd,
}: StandingScheduleCardProps) {
  const teacherName = (id: string) =>
    instructors.find((i) => i.id === id)?.name ?? 'Unassigned';

  const active = schedules.filter((s) => s.status === 'active');
  const ended = schedules.filter((s) => s.status === 'ended');

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          mb: active.length > 0 ? 2 : 0,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <EventRepeatIcon color="action" />
          <Typography variant="h6" component="h2">
            Standing schedule
          </Typography>
        </Stack>
        <Button size="small" startIcon={<AddIcon />} onClick={onAdd}>
          Add a standing slot
        </Button>
      </Box>

      {active.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No standing schedule. Lessons for this student have to be created one
          at a time, and nothing keeps them on the books.
        </Alert>
      )}

      <Stack spacing={1.5}>
        {active.map((schedule) => {
          const saving = pendingId === schedule.id;
          return (
            <Box
              key={schedule.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body1">
                  <strong>{describeSchedule(schedule)}</strong> ·{' '}
                  {schedule.durationMinutes} min · {teacherName(schedule.teacherId)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Since {formatDate(schedule.startsOn)}
                  {schedule.endsOn && ` · until ${formatDate(schedule.endsOn)}`}
                  {schedule.room && ` · ${schedule.room}`}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    saving ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <EditIcon fontSize="small" />
                    )
                  }
                  disabled={saving}
                  onClick={() => onEdit(schedule)}
                >
                  {saving ? 'Saving…' : 'Change'}
                </Button>
                <Button
                  size="small"
                  color="warning"
                  disabled={saving}
                  onClick={() => onEnd(schedule)}
                >
                  End
                </Button>
              </Stack>
            </Box>
          );
        })}
      </Stack>

      {active.length > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 2 }}
        >
          Changing this applies to lessons from here on. Lessons already on the
          calendar stay where they are — move or cancel those individually.
        </Typography>
      )}

      {ended.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary">
            Previously
          </Typography>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {ended.map((schedule) => (
              <Stack
                key={schedule.id}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <Chip size="small" label="ended" variant="outlined" />
                <Typography variant="body2" color="text.secondary">
                  {describeSchedule(schedule)} · {schedule.durationMinutes} min
                  {schedule.endsOn && ` · through ${formatDate(schedule.endsOn)}`}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
