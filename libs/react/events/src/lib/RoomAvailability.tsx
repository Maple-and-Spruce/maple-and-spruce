'use client';

import { Alert, Box, Skeleton, Typography } from '@mui/material';
import {
  getDayStrip,
  getRoomConflicts,
  getRoomLabel,
  type Room,
  type RoomBusyWindow,
  type RoomDaySegment,
} from '@maple/ts/domain';
import { useRoomScheduleForDate } from '@maple/react/data';

/** Format a time as "4:30 PM". */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Distinct booking titles in a busy band, e.g. "Music Together, Music Lesson". */
function busyTitles(windows: RoomBusyWindow[]): string {
  return [...new Set(windows.map((w) => w.title))].join(', ');
}

function conflictSummary(conflicts: RoomBusyWindow[]): string {
  return conflicts
    .map((c) => `${formatTime(c.start)}–${formatTime(c.end)} (${c.title})`)
    .join(', ');
}

function segmentLabel(seg: RoomDaySegment): string {
  if (seg.kind === 'open') {
    return `Open ${formatTime(seg.start)}–${formatTime(seg.end)}`;
  }
  return `${busyTitles(seg.windows)} ${formatTime(seg.start)}–${formatTime(seg.end)}`;
}

/**
 * Compute display bounds for the day strip: a default 9–6 window for the
 * picked day, widened to cover any booking or the proposed slot that falls
 * outside it — so nothing is ever clipped out of view.
 */
function dayBounds(
  refDate: Date,
  proposed: { start: Date; end: Date },
  windows: RoomBusyWindow[]
): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(refDate);
  dayStart.setHours(9, 0, 0, 0);
  const dayEnd = new Date(refDate);
  dayEnd.setHours(18, 0, 0, 0);

  const times = [
    proposed.start,
    proposed.end,
    ...windows.flatMap((w) => [w.start, w.end]),
  ];
  for (const t of times) {
    if (t.getTime() < dayStart.getTime()) dayStart.setTime(t.getTime());
    if (t.getTime() > dayEnd.getTime()) dayEnd.setTime(t.getTime());
  }
  return { dayStart, dayEnd };
}

interface RoomAvailabilityProps {
  room: Room;
  /** Proposed slot start (also picks the day to display). */
  start: Date;
  /** Proposed slot end. */
  end: Date;
  /** Skip this event when checking conflicts (edit flows — don't self-flag). */
  ignoreEventId?: string;
}

/**
 * Inline availability for a room on the day of a proposed slot: a
 * warn-and-confirm conflict notice (never blocks submission — legitimate
 * overlaps like setup time exist) plus a day strip of open/busy bands.
 *
 * Drop into any scheduling dialog once a date/time is picked.
 */
export function RoomAvailability({
  room,
  start,
  end,
  ignoreEventId,
}: RoomAvailabilityProps) {
  const { roomScheduleState } = useRoomScheduleForDate(room, start);

  if (
    roomScheduleState.status === 'idle' ||
    roomScheduleState.status === 'loading'
  ) {
    return <Skeleton variant="text" width="80%" />;
  }

  if (roomScheduleState.status === 'error') {
    return (
      <Typography variant="caption" color="text.secondary">
        Couldn&apos;t check {getRoomLabel(room)} availability.
      </Typography>
    );
  }

  const windows = roomScheduleState.data;
  const conflicts = getRoomConflicts({ start, end }, windows, { ignoreEventId });
  const { dayStart, dayEnd } = dayBounds(start, { start, end }, windows);
  const strip = getDayStrip(windows, dayStart, dayEnd);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {conflicts.length > 0 && (
        <Alert severity="warning" sx={{ py: 0.5 }}>
          {getRoomLabel(room)} is already booked {conflictSummary(conflicts)}.
          You can still save — overlaps are sometimes intentional.
        </Alert>
      )}

      <Typography variant="caption" color="text.secondary">
        {windows.length === 0 ? (
          <>No other {getRoomLabel(room)} bookings that day.</>
        ) : (
          <>
            {getRoomLabel(room)}:{' '}
            {strip.map((seg, i) => (
              <span key={`${seg.kind}-${seg.start.getTime()}`}>
                {i > 0 ? ' · ' : ''}
                {segmentLabel(seg)}
              </span>
            ))}
          </>
        )}
      </Typography>
    </Box>
  );
}
