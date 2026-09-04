'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import type {
  Instructor,
  Lesson,
  LessonBlock,
  RequestState,
} from '@maple/ts/domain';
import { isLessonUnattributed } from '@maple/ts/domain';

/** A row action that can be in flight. */
export type LessonRowAction = 'mark-rendered' | 'mark-no-show' | 'cancel';

/**
 * Which action is running, on which lesson.
 *
 * Per-row and per-action rather than a page-wide boolean: acting on one lesson
 * must not freeze the rest of the list, and the pressed control has to be the
 * one that shows progress. See #805.
 */
export interface LessonPendingAction {
  lessonId: string;
  action: LessonRowAction;
}

interface LessonListProps {
  lessonsState: RequestState<Lesson[]>;
  instructors: Instructor[];
  /** For attribution — a lesson's teacher that differs from the student's
   *  primary teacher is shown as "Substitute". */
  primaryTeacherId?: string;
  /** Teacher blocks; when provided, lessons not sitting in one of their
   *  teacher's blocks get a "needs a block" flag (#689). */
  blocks?: LessonBlock[];
  onEdit: (lesson: Lesson) => void;
  onCancel: (lesson: Lesson) => void;
  /**
   * Optional — when provided, past scheduled lessons get a
   * "Mark rendered" action. Required for Hope Scholarship students so
   * invoicing via EMA can only pull from rendered records; useful for
   * private-pay too so #283 payout tracking has accurate counts.
   */
  onMarkRendered?: (lesson: Lesson) => void;
  /**
   * Record that nobody came. Offered on the same rows as mark-rendered, since
   * it is the other half of the same question (#796).
   */
  onMarkNoShow?: (lesson: Lesson) => void;
  /** The action currently in flight, if any. Drives per-row progress. */
  pendingAction?: LessonPendingAction | null;
  /** For deterministic testing; defaults to current wall clock. */
  now?: Date;
}

const statusChipColor: Record<
  Lesson['status'],
  'success' | 'warning' | 'error' | 'default'
> = {
  scheduled: 'success',
  rendered: 'default',
  // Distinct from cancelled on purpose: a cancellation frees the slot and
  // charges nobody, a no-show consumed the slot and (for private pay) bills.
  'no-show': 'error',
  cancelled: 'warning',
};

/** Human label — the raw status string reads badly for the hyphenated one. */
const statusChipLabel: Record<Lesson['status'], string> = {
  scheduled: 'scheduled',
  rendered: 'rendered',
  'no-show': 'no-show',
  cancelled: 'cancelled',
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
  isUnattributed,
  isPast,
  pending,
  onEdit,
  onCancel,
  onMarkRendered,
  onMarkNoShow,
}: {
  lesson: Lesson;
  teacherName: string;
  isSubstitute: boolean;
  isUnattributed: boolean;
  isPast: boolean;
  /** The action in flight on THIS row, if any. */
  pending: LessonRowAction | null;
  onEdit: () => void;
  onCancel: () => void;
  onMarkRendered?: () => void;
  onMarkNoShow?: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const close = () => setAnchorEl(null);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const canMutate = lesson.status === 'scheduled';
  // Mark-rendered is only meaningful for past scheduled lessons; hide it
  // for future-dated rows so Katie doesn't mark something that hasn't
  // happened yet.
  const canMarkRendered = canMutate && isPast && !!onMarkRendered;
  // Same rows as mark-rendered: you only know nobody came once the time passed.
  const canMarkNoShow = canMutate && isPast && !!onMarkNoShow;

  return (
    <ListItem
      sx={{
        borderBottom: '1px solid',
        borderColor: 'divider',
        gap: 2,
        alignItems: 'center',
      }}
    >
      <ListItemText
        primary={
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
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
              label={statusChipLabel[lesson.status]}
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
            {isUnattributed && (
              <Chip label="Needs a block" size="small" color="warning" />
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
      {/*
        A real flex sibling, not MUI's `secondaryAction`. That prop positions the
        action absolutely, so a labelled button — wider than the icon buttons it
        replaces — sat on top of the row's own chips at narrow widths. Verified
        in Storybook at 420px before this was changed.
      */}
      {canMutate && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {/*
            The studio's most common action — "this lesson happened" — gets a
            word on it and one click. It used to be an unlabelled 20px green
            tick sitting beside an unlabelled orange cross that cancels.
          */}
          {canMarkRendered && (
            <Button
              size="small"
              variant="outlined"
              color="success"
              disabled={Boolean(pending)}
              startIcon={
                pending === 'mark-rendered' ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <CheckCircleIcon fontSize="small" />
                )
              }
              onClick={onMarkRendered}
            >
              {pending === 'mark-rendered' ? 'Marking…' : 'Mark rendered'}
            </Button>
          )}
          <Tooltip title="Actions">
            {/* span so the tooltip still works while the button is disabled */}
            <span>
              <IconButton
                size="small"
                aria-label={`Actions for the lesson on ${formatDateTime(
                  lesson.scheduledAt
                )}`}
                aria-haspopup="menu"
                disabled={Boolean(pending)}
                onClick={(e) => setAnchorEl(e.currentTarget)}
              >
                {pending === 'cancel' ? (
                  <CircularProgress size={16} />
                ) : (
                  <MoreVertIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
            {canMarkNoShow && onMarkNoShow && (
              <MenuItem onClick={run(onMarkNoShow)}>
                <ListItemIcon>
                  <PersonOffIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Nobody came (no-show)</ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={run(onEdit)}>
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Edit lesson</ListItemText>
            </MenuItem>
            <MenuItem onClick={run(onCancel)} sx={{ color: 'warning.main' }}>
              <ListItemIcon>
                <CancelIcon fontSize="small" color="warning" />
              </ListItemIcon>
              <ListItemText>Cancel lesson</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      )}
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
  blocks = [],
  onEdit,
  onCancel,
  onMarkRendered,
  onMarkNoShow,
  pendingAction = null,
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
      (l) =>
        l.status === 'scheduled' && l.scheduledAt.getTime() > now.getTime(),
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const past = lessons
    .filter(
      (l) =>
        l.scheduledAt.getTime() <= now.getTime() || l.status !== 'scheduled',
    )
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

  const renderRow = (lesson: Lesson) => (
    <LessonRow
      key={lesson.id}
      lesson={lesson}
      teacherName={teacherNameById.get(lesson.teacherId) ?? 'Unassigned'}
      isSubstitute={
        primaryTeacherId !== undefined && lesson.teacherId !== primaryTeacherId
      }
      isUnattributed={
        lesson.status !== 'cancelled' &&
        blocks.length > 0 &&
        isLessonUnattributed(lesson, blocks)
      }
      isPast={lesson.scheduledAt.getTime() <= now.getTime()}
      pending={
        pendingAction?.lessonId === lesson.id ? pendingAction.action : null
      }
      onEdit={() => onEdit(lesson)}
      onCancel={() => onCancel(lesson)}
      onMarkRendered={onMarkRendered ? () => onMarkRendered(lesson) : undefined}
      onMarkNoShow={onMarkNoShow ? () => onMarkNoShow(lesson) : undefined}
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
