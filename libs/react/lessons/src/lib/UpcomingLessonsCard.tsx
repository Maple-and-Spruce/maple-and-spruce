'use client';

/**
 * The next few lessons on the calendar, to adjust (#158).
 *
 * Katie plans by the weekly time and books a few concrete lessons at a time,
 * so this shows at most five — never a long series. Each has the same ⋮ menu
 * as everywhere else on the student page (`lessonActions`): move, push back a
 * week along with every later one, cancel (optionally rescheduling with a
 * credit, #209), weather, or delete.
 * A lesson rescheduled with a credit says **Credit**. **Weather** (#210)
 * reschedules a lesson with a credit or holds it online; a lesson held online
 * says **Online** and offers to bring it back **In person**.
 */
import {
  Alert,
  Box,
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
import type { LessonActionHandlers } from './lesson-actions';
import { LessonActionsMenu } from './LessonActionsMenu';

export const UPCOMING_LESSONS_SHOWN = 5;

export interface UpcomingLessonsCardProps {
  /** Upcoming, not cancelled, soonest first; the card shows the first five. */
  lessonsState: RequestState<Lesson[]>;
  paidLessonIds: ReadonlySet<string>;
  /** The lesson whose change is being saved. */
  pendingLessonId?: string | null;
  /** The ⋮ menu, the same one every tab shows. */
  actions: LessonActionHandlers;
  now?: Date;
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
  actions,
  now = new Date(),
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
                      {lesson.creditForLessonId && (
                        <Chip label="Credit" size="small" color="info" variant="outlined" />
                      )}
                      {lesson.virtual && (
                        <Chip label="Online" size="small" variant="outlined" />
                      )}
                    </Box>
                  }
                />
                <LessonActionsMenu
                  lesson={lesson}
                  context={{
                    billed: paidLessonIds.has(lesson.id),
                    // Upcoming, so there is nothing to settle after the fact.
                    isHope: false,
                    hasCard: false,
                    now,
                  }}
                  handlers={actions}
                  when={when}
                  disabled={busy}
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </Paper>
  );
}
