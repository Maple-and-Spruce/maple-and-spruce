'use client';

/**
 * The next few lessons on the calendar, to adjust (#158).
 *
 * Katie plans by the weekly time and books a few concrete lessons at a time,
 * so this shows at most five — never a long series — each of which can be
 * moved or deleted. A lesson is scheduled or deleted, paid or not: there is
 * nothing to mark.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Skeleton,
  Typography,
} from '@mui/material';
import { SCHEDULE_TIME_ZONE } from '@maple/ts/domain';
import type { Lesson, RequestState } from '@maple/ts/domain';

export const UPCOMING_LESSONS_SHOWN = 5;

export interface UpcomingLessonsCardProps {
  /** Upcoming, not cancelled, soonest first; the card shows the first five. */
  lessonsState: RequestState<Lesson[]>;
  paidLessonIds: ReadonlySet<string>;
  /** The lesson whose change is being saved. */
  pendingLessonId?: string | null;
  onMove: (lesson: Lesson) => void;
  onDelete: (lesson: Lesson) => void;
}

function formatWhen(at: Date): string {
  return at.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

export function UpcomingLessonsCard({
  lessonsState,
  paidLessonIds,
  pendingLessonId,
  onMove,
  onDelete,
}: UpcomingLessonsCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" component="h2">
        Upcoming lessons
      </Typography>
      {(lessonsState.status === 'idle' || lessonsState.status === 'loading') && (
        <Box aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="text" height={36} />
          ))}
        </Box>
      )}
      {lessonsState.status === 'error' && (
        <Alert severity="error" sx={{ mt: 1 }}>
          Could not load lessons: {lessonsState.error}
        </Alert>
      )}
      {lessonsState.status === 'success' && lessonsState.data.length === 0 && (
        <Typography color="textSecondary" sx={{ mt: 1 }}>
          No lessons are booked.
        </Typography>
      )}
      {lessonsState.status === 'success' && lessonsState.data.length > 0 && (
        <List dense aria-label="Upcoming lessons">
          {lessonsState.data.slice(0, UPCOMING_LESSONS_SHOWN).map((lesson) => {
            const when = formatWhen(lesson.scheduledAt);
            const busy = pendingLessonId === lesson.id;
            return (
              <ListItem
                key={lesson.id}
                disableGutters
                sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
              >
                <ListItemText
                  sx={{ flex: '1 1 12rem', minWidth: 0 }}
                  primary={
                    <Box
                      component="span"
                      sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
                    >
                      {when}
                      {paidLessonIds.has(lesson.id) && (
                        <Chip label="Paid" size="small" color="success" variant="outlined" />
                      )}
                    </Box>
                  }
                />
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  <Button
                    size="small"
                    disabled={busy}
                    aria-label={`Move ${when}`}
                    onClick={() => onMove(lesson)}
                  >
                    Move
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    disabled={busy}
                    aria-label={`Delete ${when}`}
                    onClick={() => onDelete(lesson)}
                  >
                    Delete
                  </Button>
                </Box>
              </ListItem>
            );
          })}
        </List>
      )}
    </Paper>
  );
}
