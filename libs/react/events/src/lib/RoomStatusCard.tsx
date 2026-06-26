'use client';

import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Skeleton,
  Typography,
} from '@mui/material';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import {
  getRoomLabel,
  getRoomStatus,
  type Room,
  type RoomBusyWindow,
  type RoomStatus,
} from '@maple/ts/domain';
import { useRoomSchedule } from '@maple/react/data';

/** Format time as "4:30 PM" */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function windowLabel(w: RoomBusyWindow): string {
  return `${w.title} (${formatTime(w.start)}–${formatTime(w.end)})`;
}

/**
 * Point-in-time occupancy widget for a room: "Free until 4:30 PM" /
 * "In use until 5:15 PM", with what's happening now and what's up next.
 * Answers the standing-in-the-building question without opening a calendar.
 */
export function RoomStatusCard({
  room,
  bookHref,
  scheduleHref,
}: {
  room: Room;
  /** When set, renders a "Book the room" action linking here. */
  bookHref?: string;
  /** When set, renders a "View schedule" action linking here. */
  scheduleHref?: string;
}) {
  const { roomScheduleState } = useRoomSchedule(room);

  const status =
    roomScheduleState.status === 'success'
      ? getRoomStatus(roomScheduleState.data, new Date())
      : null;

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <MeetingRoomIcon fontSize="small" color="primary" />
          <Typography variant="h6" component="h2">
            {getRoomLabel(room)}
          </Typography>
          {status && (
            <Chip
              label={status.kind === 'in-use' ? 'In use' : 'Free'}
              size="small"
              color={status.kind === 'in-use' ? 'warning' : 'success'}
            />
          )}
        </Box>

        {roomScheduleState.status === 'loading' ||
        roomScheduleState.status === 'idle' ? (
          <Skeleton variant="text" width="70%" />
        ) : roomScheduleState.status === 'error' ? (
          <Alert severity="error">{roomScheduleState.error}</Alert>
        ) : status ? (
          <RoomStatusLines status={status} />
        ) : null}
      </CardContent>
      {(bookHref || scheduleHref) && (
        <CardActions>
          {scheduleHref && (
            <Button size="small" href={scheduleHref}>
              View schedule
            </Button>
          )}
          {bookHref && (
            <Button size="small" href={bookHref}>
              Book the room
            </Button>
          )}
        </CardActions>
      )}
    </Card>
  );
}

function RoomStatusLines({ status }: { status: RoomStatus }) {
  if (status.kind === 'free') {
    return (
      <>
        <Typography variant="body1">
          {status.until
            ? `Free until ${formatTime(status.until)}`
            : 'Free for the rest of the day'}
        </Typography>
        {status.next && (
          <Typography variant="body2" color="text.secondary">
            Next: {windowLabel(status.next)}
          </Typography>
        )}
      </>
    );
  }

  return (
    <>
      <Typography variant="body1">
        In use until {formatTime(status.freeAt)}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Now: {windowLabel(status.current)}
        {status.next ? ` · Next: ${windowLabel(status.next)}` : ''}
      </Typography>
    </>
  );
}
