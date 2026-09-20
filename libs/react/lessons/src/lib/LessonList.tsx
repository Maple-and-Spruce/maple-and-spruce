'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table';
import type {
  Instructor,
  Lesson,
  LessonBlock,
  RequestState,
} from '@maple/ts/domain';
import { isLessonShownByDefault, isLessonUnattributed } from '@maple/ts/domain';
import { brandTableOptions, BRAND_TABLE_PAGE_SIZE } from '@maple/react/ui';

/** A row action that can be in flight. */
export type LessonRowAction = 'mark-rendered' | 'mark-no-show' | 'cancel';

/**
 * Which action is running, on which lesson.
 *
 * Per-row and per-action rather than a page-wide boolean: acting on one lesson
 * must not freeze the rest of the list, and the pressed control has to be the
 * one that shows progress. See legacy #805.
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
   *  teacher's blocks get a "needs a block" flag (legacy #689). */
  blocks?: LessonBlock[];
  onEdit: (lesson: Lesson) => void;
  onCancel: (lesson: Lesson) => void;
  /**
   * Optional — when provided, past scheduled lessons get a
   * "Mark rendered" action. Required for Hope Scholarship students so
   * invoicing via EMA can only pull from rendered records; useful for
   * private-pay too so legacy #283 payout tracking has accurate counts.
   */
  onMarkRendered?: (lesson: Lesson) => void;
  /**
   * Record that nobody came. Offered on the same rows as mark-rendered, since
   * it is the other half of the same question (legacy #796).
   */
  onMarkNoShow?: (lesson: Lesson) => void;
  /** The action currently in flight, if any. Drives per-row progress. */
  pendingAction?: LessonPendingAction | null;
  /**
   * Whether the "Show past lessons" switch starts on. Off by default: the page
   * is read for what is coming, and a student's history grows every week.
   */
  defaultShowPast?: boolean;
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

/**
 * Human labels. The stored status is `rendered` — "services rendered", which is
 * what Hope and the accounting side mean — but nobody teaching a lesson says
 * that, and Katie read it as jargon. Teachers say **taught**. The stored value
 * is unchanged; only the word on screen differs.
 */
const statusChipLabel: Record<Lesson['status'], string> = {
  scheduled: 'scheduled',
  rendered: 'taught',
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

interface LessonRow {
  id: string;
  lesson: Lesson;
  /** Sorted on; the cell renders the formatted date. */
  scheduledAtMs: number;
  teacherName: string;
  isSubstitute: boolean;
  isUnattributed: boolean;
  isPast: boolean;
}

/**
 * The actions cell. "This lesson happened" gets a word on it and one click;
 * everything else lives behind one overflow, the way StudentList does it.
 */
function LessonRowActions({
  row,
  pending,
  onEdit,
  onCancel,
  onMarkRendered,
  onMarkNoShow,
}: {
  row: LessonRow;
  /** The action in flight on THIS row, if any. */
  pending: LessonRowAction | null;
  onEdit: (lesson: Lesson) => void;
  onCancel: (lesson: Lesson) => void;
  onMarkRendered?: (lesson: Lesson) => void;
  onMarkNoShow?: (lesson: Lesson) => void;
}) {
  const { lesson, isPast } = row;
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

  if (!canMutate) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.5,
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
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
          onClick={() => onMarkRendered?.(lesson)}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {pending === 'mark-rendered' ? 'Marking…' : 'Mark taught'}
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
          <MenuItem onClick={run(() => onMarkNoShow(lesson))}>
            <ListItemIcon>
              <PersonOffIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Nobody came (no-show)</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={run(() => onEdit(lesson))}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit lesson</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={run(() => onCancel(lesson))}
          sx={{ color: 'warning.main' }}
        >
          <ListItemIcon>
            <CancelIcon fontSize="small" color="warning" />
          </ListItemIcon>
          <ListItemText>Cancel lesson</ListItemText>
        </MenuItem>
      </Menu>
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
  defaultShowPast = false,
  now,
}: LessonListProps) {
  const [showPast, setShowPast] = useState(defaultShowPast);
  // Pinned once per mount unless injected, so rows do not shift between
  // renders as the clock ticks past a lesson.
  const [mountedAt] = useState(() => new Date());
  const reference = now ?? mountedAt;

  const allRows = useMemo<LessonRow[]>(() => {
    if (lessonsState.status !== 'success') return [];
    const teacherNameById = new Map(instructors.map((i) => [i.id, i.name]));
    return lessonsState.data.map((lesson) => ({
      id: lesson.id,
      lesson,
      scheduledAtMs: lesson.scheduledAt.getTime(),
      teacherName: teacherNameById.get(lesson.teacherId) ?? 'Unassigned',
      isSubstitute:
        primaryTeacherId !== undefined && lesson.teacherId !== primaryTeacherId,
      isUnattributed:
        lesson.status !== 'cancelled' &&
        blocks.length > 0 &&
        isLessonUnattributed(lesson, blocks),
      isPast: lesson.scheduledAt.getTime() <= reference.getTime(),
    }));
  }, [lessonsState, instructors, primaryTeacherId, blocks, reference]);

  const rows = useMemo(
    () =>
      showPast
        ? allRows
        : allRows.filter((r) => isLessonShownByDefault(r.lesson, reference)),
    [allRows, showPast, reference]
  );
  const hiddenPastCount = allRows.length - rows.length;

  const columns = useMemo<MRT_ColumnDef<LessonRow>[]>(
    () => [
      {
        accessorKey: 'scheduledAtMs',
        header: 'Date / Time',
        size: 210,
        Cell: ({ row }) => (
          <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
            {formatDateTime(row.original.lesson.scheduledAt)}
          </Typography>
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => statusChipLabel[row.lesson.status],
        header: 'Status',
        size: 220,
        Cell: ({ row }) => {
          const { lesson, isUnattributed } = row.original;
          return (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
              <Chip
                label={statusChipLabel[lesson.status]}
                size="small"
                color={statusChipColor[lesson.status]}
              />
              {lesson.seriesId && (
                <Chip label="Series" size="small" variant="outlined" />
              )}
              {isUnattributed && (
                <Chip label="Needs a block" size="small" color="warning" />
              )}
            </Stack>
          );
        },
      },
      {
        accessorKey: 'teacherName',
        header: 'Teacher',
        size: 180,
        Cell: ({ row }) => (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" noWrap>
              {row.original.teacherName}
            </Typography>
            {row.original.isSubstitute && (
              <Chip
                label="Substitute"
                size="small"
                color="info"
                variant="outlined"
              />
            )}
          </Stack>
        ),
      },
      {
        id: 'duration',
        accessorFn: (row) => row.lesson.durationMinutes,
        header: 'Length',
        size: 100,
        Cell: ({ row }) => `${row.original.lesson.durationMinutes} min`,
      },
      {
        id: 'notes',
        accessorFn: (row) => row.lesson.notes ?? '',
        header: 'Notes',
        size: 220,
        enableSorting: false,
        Cell: ({ row }) => (
          <Typography variant="body2" color="text.secondary" noWrap>
            {row.original.lesson.notes ?? ''}
          </Typography>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 190,
        enableSorting: false,
        enableColumnActions: false,
        muiTableBodyCellProps: { align: 'right' },
        muiTableHeadCellProps: { align: 'right' },
        Cell: ({ row }) => (
          <LessonRowActions
            row={row.original}
            pending={
              pendingAction?.lessonId === row.original.id
                ? pendingAction.action
                : null
            }
            onEdit={onEdit}
            onCancel={onCancel}
            onMarkRendered={onMarkRendered}
            onMarkNoShow={onMarkNoShow}
          />
        ),
      },
    ],
    [onEdit, onCancel, onMarkRendered, onMarkNoShow, pendingAction]
  );

  const table = useMaterialReactTable({
    ...brandTableOptions<LessonRow>(),
    columns,
    data: rows,
    getRowId: (row) => row.id,
    state: { isLoading: lessonsState.status === 'loading' },
    // When the lesson is, and what can be done about it, stay on screen while
    // the details between scroll.
    enableColumnPinning: true,
    initialState: {
      // Soonest first: the page is read for what is coming next.
      sorting: [{ id: 'scheduledAtMs', desc: false }],
      columnPinning: { left: ['scheduledAtMs'], right: ['actions'] },
      pagination: { pageIndex: 0, pageSize: BRAND_TABLE_PAGE_SIZE },
      density: 'comfortable',
    },
    renderTopToolbarCustomActions: () => (
      <FormControlLabel
        sx={{ ml: 0.5 }}
        control={
          <Switch
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
          />
        }
        label={
          showPast || hiddenPastCount === 0
            ? 'Show past lessons'
            : `Show past lessons (${hiddenPastCount})`
        }
      />
    ),
    renderEmptyRowsFallback: () => (
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ py: 4, textAlign: 'center', width: '100%' }}
      >
        {allRows.length === 0
          ? 'No lessons scheduled yet.'
          : 'No upcoming lessons. Turn on “Show past lessons” to see history.'}
      </Typography>
    ),
  });

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

  return <MaterialReactTable table={table} />;
}
