'use client';

import {
  Alert,
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { Instructor, Lesson, RequestState } from '@maple/ts/domain';

interface LessonListProps {
  lessonsState: RequestState<Lesson[]>;
  instructors: Instructor[];
  /** For attribution — a lesson's teacher that differs from the student's
   *  primary teacher is shown as "Substitute". */
  primaryTeacherId?: string;
  onEdit: (lesson: Lesson) => void;
  onCancel: (lesson: Lesson) => void;
  /**
   * Optional — when provided, past scheduled lessons get a
   * "Mark rendered" action. Required for Hope Scholarship students so
   * invoicing via EMA can only pull from rendered records; useful for
   * private-pay too so #283 payout tracking has accurate counts.
   */
  onMarkRendered?: (lesson: Lesson) => void;
  /** For deterministic testing; defaults to current wall clock. */
  now?: Date;
}

const statusChipColor: Record<
  Lesson['status'],
  'success' | 'warning' | 'default'
> = {
  scheduled: 'success',
  rendered: 'default',
  cancelled: 'warning',
};

function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function LessonRow({
  lesson,
  teacherName,
  isSubstitute,
  isPast,
  onEdit,
  onCancel,
  onMarkRendered,
}: {
  lesson: Lesson;
  teacherName: string;
  isSubstitute: boolean;
  isPast: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onMarkRendered?: () => void;
}) {
  const canMutate = lesson.status === 'scheduled';
  // Mark-rendered is only meaningful for past scheduled lessons; hide it
  // for future-dated rows so Katie doesn't mark something that hasn't
  // happened yet.
  const canMarkRendered = canMutate && isPast && !!onMarkRendered;

  return (
    <ListItem
      sx={{
        borderBottom: '1px solid',
        borderColor: 'divider',
        gap: 1,
        alignItems: 'center',
      }}
      secondaryAction={
        canMutate ? (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {canMarkRendered && (
              <IconButton
                edge="end"
                onClick={onMarkRendered}
                size="small"
                aria-label="Mark lesson as rendered"
                color="success"
              >
                <CheckCircleIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton
              edge="end"
              onClick={onEdit}
              size="small"
              aria-label="Edit lesson"
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              edge="end"
              onClick={onCancel}
              size="small"
              aria-label="Cancel lesson"
              color="warning"
            >
              <CancelIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : null
      }
    >
      <ListItemText
        primary={
          <Box
            sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <Typography variant="body1" component="span">
              {formatDateTime(lesson.scheduledAt)}
            </Typography>
            <Chip
              label={`${lesson.durationMinutes} min`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={lesson.status}
              size="small"
              color={statusChipColor[lesson.status]}
            />
            {lesson.seriesId && (
              <Chip label="Series" size="small" variant="outlined" />
            )}
            {isSubstitute && (
              <Chip
                label="Substitute"
                size="small"
                color="info"
                variant="outlined"
              />
            )}
          </Box>
        }
        secondary={
          <Typography variant="body2" color="text.secondary">
            Taught by {teacherName}
            {lesson.notes ? ` · ${lesson.notes}` : ''}
          </Typography>
        }
      />
    </ListItem>
  );
}

function LoadingSkeleton() {
  return (
    <Box>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rectangular" height={56} sx={{ mb: 1 }} />
      ))}
    </Box>
  );
}

export function LessonList({
  lessonsState,
  instructors,
  primaryTeacherId,
  onEdit,
  onCancel,
  onMarkRendered,
  now = new Date(),
}: LessonListProps) {
  if (lessonsState.status === 'loading') {
    return <LoadingSkeleton />;
  }

  if (lessonsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load lessons: {lessonsState.error}
      </Alert>
    );
  }

  if (lessonsState.status === 'idle') {
    return null;
  }

  const lessons = lessonsState.data;

  if (lessons.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        <Typography variant="body1">No lessons scheduled yet.</Typography>
      </Box>
    );
  }

  const teacherNameById = new Map(instructors.map((i) => [i.id, i.name]));

  const upcoming = lessons
    .filter(
      (l) => l.status === 'scheduled' && l.scheduledAt.getTime() > now.getTime()
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const past = lessons
    .filter(
      (l) => l.scheduledAt.getTime() <= now.getTime() || l.status !== 'scheduled'
    )
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

  const renderRow = (lesson: Lesson) => (
    <LessonRow
      key={lesson.id}
      lesson={lesson}
      teacherName={
        teacherNameById.get(lesson.teacherId) ?? 'Unassigned'
      }
      isSubstitute={
        primaryTeacherId !== undefined &&
        lesson.teacherId !== primaryTeacherId
      }
      isPast={lesson.scheduledAt.getTime() <= now.getTime()}
      onEdit={() => onEdit(lesson)}
      onCancel={() => onCancel(lesson)}
      onMarkRendered={
        onMarkRendered ? () => onMarkRendered(lesson) : undefined
      }
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: 'block', mb: 1 }}
        >
          Upcoming
        </Typography>
        {upcoming.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No upcoming lessons.
          </Typography>
        ) : (
          <List disablePadding>{upcoming.map(renderRow)}</List>
        )}
      </Box>

      <Box>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: 'block', mb: 1 }}
        >
          Past
        </Typography>
        {past.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No past lessons.
          </Typography>
        ) : (
          <List disablePadding>{past.map(renderRow)}</List>
        )}
      </Box>
    </Box>
  );
}
