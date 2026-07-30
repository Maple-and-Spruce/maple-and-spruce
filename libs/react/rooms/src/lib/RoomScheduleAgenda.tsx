'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import {
  getRoomLabel,
  groupRoomScheduleByDay,
  type CalendarEventType,
  type Room,
  type RoomBusyWindow,
  type RoomScheduleDay,
} from '@maple/ts/domain';
import { useRoomScheduleRange } from './useRoomScheduleRange';

// 2–12 weeks: a single 12-week view spans ~3 months, and Prev/Next page by the
// selected horizon so repeatedly clicking Next walks the whole year.
const HORIZON_OPTIONS = [2, 4, 8, 12] as const;
const DEFAULT_HORIZON_WEEKS = 4;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** "Jul 30 – Aug 27, 2026" — the span of the currently visible window. */
export function formatWindowRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endStr = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}

/** Chip label + MUI color for each calendar event type. */
const TYPE_CHIP: Record<
  CalendarEventType,
  { label: string; color: 'default' | 'primary' | 'secondary' | 'info' | 'success' }
> = {
  lesson: { label: 'Lesson', color: 'info' },
  class: { label: 'Class', color: 'primary' },
  event: { label: 'Booking', color: 'secondary' },
  jam: { label: 'Jam', color: 'success' },
  hours: { label: 'Hours', color: 'default' },
  musictogether: { label: 'Music Together', color: 'secondary' },
};

/** Format a time as "4:30 PM". */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Thu, Jun 26" */
function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** "Jun 26" — no weekday, for collapsed open-day ranges. */
function formatDayShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Day heading with a relative prefix for today/tomorrow. */
function dayHeading(date: Date, now: Date): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameLocalDay(date, now)) return `Today · ${formatDay(date)}`;
  if (isSameLocalDay(date, tomorrow)) return `Tomorrow · ${formatDay(date)}`;
  return formatDay(date);
}

function BookingRow({ window }: { window: RoomBusyWindow }) {
  const chip = TYPE_CHIP[window.type];
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 1.5,
        py: 0.5,
      }}
    >
      <Typography
        variant="body2"
        sx={{ minWidth: 132, color: 'text.secondary', flexShrink: 0 }}
      >
        {formatTime(window.start)}–{formatTime(window.end)}
      </Typography>
      <Typography variant="body2" sx={{ flexGrow: 1 }}>
        {window.title}
      </Typography>
      <Chip label={chip.label} color={chip.color} size="small" variant="outlined" />
    </Box>
  );
}

/**
 * The grouped day list. Presentational — takes the already-bucketed days and
 * the reference "now" (for the Today/Tomorrow prefixes). Consecutive days
 * with no bookings collapse into a single "Open" range so a mostly-free
 * horizon doesn't become a wall of "Open all day" rows.
 */
export function RoomScheduleAgendaList({
  days,
  now,
}: {
  days: RoomScheduleDay[];
  now: Date;
}) {
  const rows: React.ReactNode[] = [];
  let openRunStart: Date | null = null;
  let openRunEnd: Date | null = null;

  const flushOpenRun = () => {
    if (!openRunStart || !openRunEnd) return;
    const single = isSameLocalDay(openRunStart, openRunEnd);
    const label = single
      ? dayHeading(openRunStart, now)
      : `${formatDayShort(openRunStart)} – ${formatDayShort(openRunEnd)}`;
    rows.push(
      <Box
        key={`open-${openRunStart.getTime()}`}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}
      >
        <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.disabled' }}>
          · Open all day
        </Typography>
      </Box>
    );
    openRunStart = null;
    openRunEnd = null;
  };

  for (const day of days) {
    if (day.windows.length === 0) {
      if (!openRunStart) openRunStart = day.date;
      openRunEnd = day.date;
      continue;
    }
    flushOpenRun();
    rows.push(
      <Box key={`day-${day.date.getTime()}`} sx={{ py: 0.75 }}>
        <Typography variant="subtitle2" gutterBottom>
          {dayHeading(day.date, now)}
        </Typography>
        <Stack divider={<Divider flexItem />} sx={{ pl: 0.5 }}>
          {day.windows.map((w) => (
            <BookingRow key={w.eventId} window={w} />
          ))}
        </Stack>
      </Box>
    );
  }
  flushOpenRun();

  return <Stack divider={<Divider flexItem />}>{rows}</Stack>;
}

export interface RoomScheduleAgendaProps {
  room: Room;
  /** When set, renders a "Book the room" action linking here. */
  bookHref?: string;
}

/**
 * Upcoming-usage agenda for a room: every booking over the next few weeks,
 * grouped by day, so anyone can see when the room is free to plan a use.
 * Read-only — booking happens through the linked form. Powered by the same
 * `getRoomSchedule` callable as the dashboard widget and conflict warnings.
 */
export function RoomScheduleAgenda({ room, bookHref }: RoomScheduleAgendaProps) {
  const [horizonWeeks, setHorizonWeeks] = useState<number>(DEFAULT_HORIZON_WEEKS);
  // Weeks the visible window is shifted from today (0 = now-anchored). Prev/Next
  // step this by the current horizon; Today resets it to 0.
  const [offsetWeeks, setOffsetWeeks] = useState(0);

  // Pin "today" once so the window is stable across renders (and Today always
  // returns to the same now-anchored span). The hook buckets refetches on the
  // calendar day of start/end, so the window only refetches when it moves.
  const [todayAnchor] = useState(() => new Date());

  const { start, end } = useMemo(() => {
    const startDate = new Date(
      todayAnchor.getTime() + offsetWeeks * MS_PER_WEEK
    );
    const endDate = new Date(startDate.getTime() + horizonWeeks * MS_PER_WEEK);
    return { start: startDate, end: endDate };
  }, [todayAnchor, offsetWeeks, horizonWeeks]);

  const { roomScheduleState } = useRoomScheduleRange(room, start, end);

  const days = useMemo(() => {
    if (roomScheduleState.status !== 'success') return [];
    return groupRoomScheduleByDay(roomScheduleState.data, start, end);
  }, [roomScheduleState, start, end]);

  const rangeLabel = formatWindowRange(start, end);
  const goPrev = () => setOffsetWeeks((o) => o - horizonWeeks);
  const goNext = () => setOffsetWeeks((o) => o + horizonWeeks);
  const goToday = () => setOffsetWeeks(0);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={horizonWeeks}
          onChange={(_, value) => value && setHorizonWeeks(value)}
          aria-label="schedule horizon"
        >
          {HORIZON_OPTIONS.map((weeks) => (
            <ToggleButton key={weeks} value={weeks} aria-label={`${weeks} weeks`}>
              {weeks}w
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {bookHref && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<MeetingRoomIcon />}
            href={bookHref}
          >
            Book the room
          </Button>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={<ChevronLeftIcon />}
          onClick={goPrev}
          aria-label="previous weeks"
        >
          Prev
        </Button>
        <Button
          size="small"
          variant="outlined"
          endIcon={<ChevronRightIcon />}
          onClick={goNext}
          aria-label="next weeks"
        >
          Next
        </Button>
        <Button
          size="small"
          startIcon={<TodayIcon />}
          onClick={goToday}
          disabled={offsetWeeks === 0}
          aria-label="jump back to today"
        >
          Today
        </Button>
        <Typography
          variant="subtitle2"
          data-testid="room-schedule-range"
          aria-live="polite"
          sx={{
            ml: 'auto',
            color: 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {rangeLabel}
        </Typography>
      </Box>

      {roomScheduleState.status === 'loading' ||
      roomScheduleState.status === 'idle' ? (
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </Stack>
      ) : roomScheduleState.status === 'error' ? (
        <Alert severity="error">
          Couldn&apos;t load the {getRoomLabel(room)} schedule:{' '}
          {roomScheduleState.error}
        </Alert>
      ) : days.every((d) => d.windows.length === 0) ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: 'text.secondary',
            py: 3,
          }}
        >
          <EventBusyIcon fontSize="small" />
          <Typography variant="body2">
            No {getRoomLabel(room)} bookings for {rangeLabel} — it&apos;s open the
            whole time.
          </Typography>
        </Box>
      ) : (
        <RoomScheduleAgendaList days={days} now={todayAnchor} />
      )}
    </Box>
  );
}
