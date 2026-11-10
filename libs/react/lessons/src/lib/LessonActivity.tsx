'use client';

/**
 * Every lesson the student has had or has booked, newest first (#158), as a
 * table: when, how long, who taught it, and what became of it.
 *
 * An audit record Katie will rarely open. A paid lesson says **Paid**; a past
 * lesson nobody paid for in the portal carries **no label at all**. Past
 * payments were settled outside the portal, so an unpaid lesson here is not a
 * problem and must not read like a debt. If one genuinely is owed, its row
 * menu can charge the card or send an invoice — the only place a past lesson
 * can be charged for, and a quiet one.
 *
 * Every row's menu is the one every tab shows (`lessonActions`): move it,
 * push it back a week with every later one, and:
 *  - **Cancel…**: the cancel dialog, which can also reschedule the lesson with
 *    a credit (#209). A cancelled lesson can be undone, or rescheduled with a
 *    credit later; once it has been, its row says where to, and the new
 *    lesson's row says which lesson it is a credit for.
 *  - **Weather…** (#210): reschedule with a credit or hold it online. A lesson
 *    held online says so, and can be brought back **In person**.
 *  - **Delete**: it is gone, as if it was never booked.
 *
 * "Add a lesson" sits on the table too, so a lesson that happened but never
 * made it onto the calendar can be recorded where the record is read.
 */
import { useMemo } from 'react';
import { Alert, Box, Button, Chip, Skeleton, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table';
import { SCHEDULE_TIME_ZONE } from '@maple/ts/domain';
import type { Instructor, Lesson, RequestState } from '@maple/ts/domain';
import { brandTableOptions, BRAND_TABLE_PAGE_SIZE } from '@maple/react/ui';
import type { LessonActionHandlers } from './lesson-actions';
import { LessonActionsMenu } from './LessonActionsMenu';

export type LessonActivityLabel = 'paid' | 'invoiced' | 'cancelled' | 'none';

export interface LessonActivityProps {
  lessonsState: RequestState<Lesson[]>;
  /** What each lesson's row says; anything not listed says nothing. */
  labelOf: (lesson: Lesson) => LessonActivityLabel;
  /** Hope lessons bill through EMA, so nothing here charges them. */
  isHope: boolean;
  /** Whether a card is linked, so "Charge the card" is offered. */
  hasCard: boolean;
  /** Names the teacher column; without it the column is left out. */
  instructors?: Instructor[];
  /** The lesson a link pointed at, shown highlighted. */
  highlightLessonId?: string | null;
  busy: boolean;
  error?: string | null;
  now?: Date;
  /** The row menu, the same one every tab shows. */
  actions: LessonActionHandlers;
  /**
   * The lesson that replaced a cancelled one, if any (#209). A replaced lesson
   * cannot be restored or credited again, and its row says where it went.
   */
  replacementOf?: (lesson: Lesson) => Lesson | undefined;
  /** Offers "Add a lesson" on the table. */
  onAdd?: () => void;
}

const LABELS: Record<
  Exclude<LessonActivityLabel, 'none'>,
  { text: string; color: 'success' | 'info' | 'default' }
> = {
  paid: { text: 'Paid', color: 'success' },
  invoiced: { text: 'Invoiced', color: 'info' },
  cancelled: { text: 'Cancelled', color: 'default' },
};

function formatWhen(at: Date): string {
  return at.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

function formatDate(at: Date): string {
  return at.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

function formatTime(at: Date): string {
  return at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

interface ActivityRow {
  lesson: Lesson;
  atMs: number;
  label: LessonActivityLabel;
  teacher: string;
  /** "Rescheduled to …" or "Credit for …", for lessons a credit links. */
  note?: string;
  replaced: boolean;
}

function shortDate(at: Date): string {
  return at.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

export function LessonActivity(props: LessonActivityProps) {
  const { lessonsState } = props;

  if (lessonsState.status === 'idle' || lessonsState.status === 'loading') {
    return (
      <Box aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="text" height={36} />
        ))}
      </Box>
    );
  }
  if (lessonsState.status === 'error') {
    return (
      <Alert severity="error">Could not load lessons: {lessonsState.error}</Alert>
    );
  }
  // Mounted only once the lessons are known, so the table opens on the page
  // holding a linked lesson rather than on whatever was there while loading.
  return <ActivityTable {...props} lessons={lessonsState.data} />;
}

function ActivityTable({
  lessons,
  labelOf,
  isHope,
  hasCard,
  instructors,
  highlightLessonId,
  busy,
  error,
  now = new Date(),
  actions,
  replacementOf,
  onAdd,
}: LessonActivityProps & { lessons: Lesson[] }) {
  const nowMs = now.getTime();

  const rows = useMemo<ActivityRow[]>(() => {
    const names = new Map((instructors ?? []).map((i) => [i.id, i.name]));
    const byId = new Map(lessons.map((l) => [l.id, l]));
    return [...lessons]
      .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
      .map((lesson) => {
        const label = labelOf(lesson);
        const replacement = replacementOf?.(lesson);
        const original = lesson.creditForLessonId
          ? byId.get(lesson.creditForLessonId)
          : undefined;
        const notes: string[] = [];
        if (lesson.cancelledFor === 'weather') notes.push('Weather');
        if (replacement) {
          notes.push(`Rescheduled to ${shortDate(replacement.scheduledAt)}`);
        } else if (lesson.creditForLessonId) {
          notes.push(
            original ? `Credit for ${shortDate(original.scheduledAt)}` : 'Credit'
          );
        }
        if (lesson.virtual && lesson.status !== 'cancelled') notes.push('Online');
        const note = notes.length > 0 ? notes.join(' · ') : undefined;
        return {
          lesson,
          atMs: lesson.scheduledAt.getTime(),
          label,
          teacher: names.get(lesson.teacherId) ?? '',
          note,
          replaced: Boolean(replacement),
        };
      });
  }, [lessons, labelOf, replacementOf, instructors]);

  const columns = useMemo<MRT_ColumnDef<ActivityRow>[]>(
    () => [
      {
        accessorKey: 'atMs',
        header: 'Date',
        size: 200,
        Cell: ({ row }) => formatDate(row.original.lesson.scheduledAt),
      },
      {
        id: 'time',
        header: 'Time',
        size: 110,
        enableSorting: false,
        Cell: ({ row }) => formatTime(row.original.lesson.scheduledAt),
      },
      {
        accessorFn: (row) => row.lesson.durationMinutes,
        id: 'length',
        header: 'Length',
        size: 100,
        Cell: ({ row }) => `${row.original.lesson.durationMinutes} min`,
      },
      ...(instructors
        ? [{ accessorKey: 'teacher', header: 'Teacher', size: 160 } as const]
        : []),
      {
        accessorKey: 'label',
        header: 'Status',
        size: 220,
        Cell: ({ row }) => {
          const { label, note } = row.original;
          return (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {label !== 'none' && (
                <Chip
                  label={LABELS[label].text}
                  size="small"
                  color={LABELS[label].color}
                  variant="outlined"
                />
              )}
              {note && (
                <Typography variant="body2" color="textSecondary" component="span">
                  {note}
                </Typography>
              )}
            </Box>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        size: 60,
        enableSorting: false,
        enableColumnActions: false,
        muiTableBodyCellProps: { align: 'right' },
        Cell: ({ row }) => (
          <LessonActionsMenu
            lesson={row.original.lesson}
            context={{
              billed:
                row.original.label === 'paid' || row.original.label === 'invoiced',
              isHope,
              hasCard,
              replaced: row.original.replaced,
              now: new Date(nowMs),
            }}
            handlers={actions}
            when={formatWhen(row.original.lesson.scheduledAt)}
            disabled={busy}
          />
        ),
      },
    ],
    [instructors, busy, isHope, hasCard, actions, nowMs]
  );

  const highlightIndex = highlightLessonId
    ? rows.findIndex((r) => r.lesson.id === highlightLessonId)
    : -1;

  const table = useMaterialReactTable({
    ...brandTableOptions<ActivityRow>(),
    columns,
    data: rows,
    getRowId: (row) => row.lesson.id,
    enableColumnActions: false,
    initialState: {
      sorting: [{ id: 'atMs', desc: true }],
      pagination: {
        pageIndex:
          highlightIndex >= 0 ? Math.floor(highlightIndex / BRAND_TABLE_PAGE_SIZE) : 0,
        pageSize: BRAND_TABLE_PAGE_SIZE,
      },
      density: 'compact',
    },
    // One page is the usual case; then there is nothing for a footer to hold.
    enablePagination: rows.length > BRAND_TABLE_PAGE_SIZE,
    enableBottomToolbar: rows.length > BRAND_TABLE_PAGE_SIZE,
    muiTableBodyRowProps: ({ row }) =>
      row.original.lesson.id === highlightLessonId
        ? { selected: true, sx: { '& td': { bgcolor: 'action.selected' } } }
        : {},
    renderTopToolbarCustomActions: () =>
      onAdd ? (
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={onAdd}
          sx={{ ml: 0.5 }}
        >
          Add a lesson
        </Button>
      ) : null,
    renderEmptyRowsFallback: () => (
      <Typography
        variant="body2"
        color="textSecondary"
        sx={{ py: 4, textAlign: 'center', width: '100%' }}
      >
        No lessons yet.
      </Typography>
    ),
  });

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box aria-label="Lesson activity" role="region">
        <MaterialReactTable table={table} />
      </Box>
    </>
  );
}
