'use client';

import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Grid2 as Grid,
  Skeleton,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RepeatIcon from '@mui/icons-material/Repeat';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { CalendarEvent, RequestState } from '@maple/ts/domain';
import { getCalendarEventTypeLabel } from '@maple/ts/domain';

interface CalendarEventListProps {
  calendarEventsState: RequestState<CalendarEvent[]>;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

const typeColors: Record<string, 'primary' | 'secondary' | 'warning' | 'info' | 'default'> = {
  class: 'primary',
  lesson: 'secondary',
  event: 'warning',
  jam: 'info',
  hours: 'default',
};

function formatDateTime(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function formatTimeRange(start: Date, end: Date): string {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const startStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(s);
  const endStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(e);
  return `${startStr} - ${endStr}`;
}

function CalendarEventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const startDateTime =
    event.startDateTime instanceof Date
      ? event.startDateTime
      : new Date(event.startDateTime);
  const endDateTime =
    event.endDateTime instanceof Date
      ? event.endDateTime
      : new Date(event.endDateTime);

  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              {event.title}
            </Typography>

            {/* Date and Time */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <EventIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(startDateTime)}
              </Typography>
            </Box>

            {/* Time Range */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {formatTimeRange(startDateTime, endDateTime)}
              </Typography>
            </Box>

            {/* Recurrence */}
            {event.recurrenceRule && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <RepeatIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {event.recurrenceRule}
                </Typography>
              </Box>
            )}

            {/* Location */}
            {event.location && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {event.location}
              </Typography>
            )}

            {/* Chips */}
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={getCalendarEventTypeLabel(event.type)}
                size="small"
                color={typeColors[event.type]}
              />
              <Chip
                icon={event.public ? <VisibilityIcon /> : <VisibilityOffIcon />}
                label={event.public ? 'Public' : 'Private'}
                size="small"
                variant="outlined"
                color={event.public ? 'success' : 'default'}
              />
              {event.sourceRef && (
                <Chip
                  label="Auto-generated"
                  size="small"
                  variant="outlined"
                  color="info"
                />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton onClick={onEdit} size="small" aria-label="Edit">
              <EditIcon />
            </IconButton>
            <IconButton
              onClick={onDelete}
              size="small"
              aria-label="Delete"
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Grid container spacing={2}>
      {[1, 2, 3].map((i) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
          <Card>
            <CardContent>
              <Skeleton variant="text" width="70%" height={32} />
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Skeleton variant="rounded" width={70} height={24} />
                <Skeleton variant="rounded" width={80} height={24} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export function CalendarEventList({
  calendarEventsState,
  onEdit,
  onDelete,
}: CalendarEventListProps) {
  if (calendarEventsState.status === 'loading') {
    return <LoadingSkeleton />;
  }

  if (calendarEventsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load calendar events: {calendarEventsState.error}
      </Alert>
    );
  }

  if (calendarEventsState.status === 'idle') {
    return null;
  }

  const events = calendarEventsState.data;

  if (events.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
        }}
      >
        <Typography variant="h6">No calendar events yet</Typography>
        <Typography>Click "Add Event" to get started</Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {events.map((event) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={event.id}>
          <CalendarEventCard
            event={event}
            onEdit={() => onEdit(event)}
            onDelete={() => onDelete(event)}
          />
        </Grid>
      ))}
    </Grid>
  );
}
