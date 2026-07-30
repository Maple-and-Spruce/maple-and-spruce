'use client';

/**
 * MyWeek — the teacher's week at a glance (#685).
 *
 * Seven day columns (Sun–Sat). A teacher's weekly blocks render as containers
 * with 30-minute slots (filled by a lesson or "open") — the view Katie uses to
 * see where a new student fits. Commitments outside a block (classes, jams,
 * store hours, Music Together, out-of-block/unattributed lessons) list under
 * "Also this day". Categories are color-coded and can be toggled off; the
 * toggle state is sticky per browser. Presentational — the page owns the data
 * (`useMyWeek`) and week navigation.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import Button from '@mui/material/Button';
import type { CalendarEventType, RequestState } from '@maple/ts/domain';
import {
  DEFAULT_LESSON_TIME_ZONE,
  WEEKDAY_LONG,
  getCalendarEventTypeLabel,
  minutesOfDayInZone,
  weekdayIndexInZone,
} from '@maple/ts/domain';
import type {
  GetMyWeekResponse,
  MyWeekBlock,
  MyWeekCommitment,
} from '@maple/ts/firebase/api-types';
import { formatMinutes } from './block-format';

export interface MyWeekProps {
  weekState: RequestState<GetMyWeekResponse>;
  /** Local Sunday 00:00 of the displayed week. */
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MINUTES = 30;
const TZ = DEFAULT_LESSON_TIME_ZONE;
const CATEGORIES: CalendarEventType[] = [
  'lesson',
  'class',
  'jam',
  'event',
  'musictogether',
  'hours',
];
const STORAGE_KEY = 'myWeek.hiddenCategories';

/** Category → MUI chip color (mirrors the RoomScheduleAgenda convention). */
const CATEGORY_COLOR: Record<
  CalendarEventType,
  'default' | 'primary' | 'secondary' | 'info' | 'success'
> = {
  lesson: 'info',
  class: 'primary',
  jam: 'success',
  event: 'secondary',
  musictogether: 'secondary',
  hours: 'default',
};

function startMinutesOf(iso: string): number {
  return minutesOfDayInZone(new Date(iso), TZ);
}
function weekdayOf(iso: string): number {
  return weekdayIndexInZone(new Date(iso), TZ);
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart.getTime() + 6 * DAY_MS);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

function CommitmentChip({ c }: { c: MyWeekCommitment }) {
  const label = `${formatMinutes(startMinutesOf(c.startDateTime))} ${
    c.unattributed ? '⚠ ' : ''
  }${c.title}`;
  return (
    <Chip
      size="small"
      label={label}
      color={c.unattributed ? 'warning' : CATEGORY_COLOR[c.category]}
      // Shared store-wide events read as context (outlined); the teacher's own
      // as solid. One-offs are faded so standing commitments stand out.
      variant={c.ownership === 'shared' ? 'outlined' : 'filled'}
      sx={{ opacity: c.cadence === 'one-off' ? 0.6 : 1, maxWidth: '100%' }}
    />
  );
}

export function MyWeek({
  weekState,
  weekStart,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
}: MyWeekProps) {
  const [hidden, setHidden] = useState<Set<CalendarEventType>>(new Set());

  // Sticky toggle state (per browser). Read after mount to avoid SSR mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as CalendarEventType[]));
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const toggleCategory = (cat: CalendarEventType) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const header = (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
      sx={{ mb: 2 }}
    >
      <IconButton aria-label="Previous week" onClick={onPrevWeek} size="small">
        <ChevronLeftIcon />
      </IconButton>
      <Button
        size="small"
        startIcon={<TodayIcon />}
        onClick={onThisWeek}
        variant="outlined"
      >
        This week
      </Button>
      <IconButton aria-label="Next week" onClick={onNextWeek} size="small">
        <ChevronRightIcon />
      </IconButton>
      <Typography variant="subtitle1" sx={{ ml: 1, fontWeight: 600 }}>
        {formatWeekRange(weekStart)}
      </Typography>
    </Stack>
  );

  const toggles = (
    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2, gap: 1 }}>
      {CATEGORIES.map((cat) => {
        const on = !hidden.has(cat);
        return (
          <Chip
            key={cat}
            label={getCalendarEventTypeLabel(cat)}
            size="small"
            color={on ? CATEGORY_COLOR[cat] : 'default'}
            variant={on ? 'filled' : 'outlined'}
            onClick={() => toggleCategory(cat)}
            aria-pressed={on}
            sx={{ opacity: on ? 1 : 0.5 }}
          />
        );
      })}
    </Stack>
  );

  if (weekState.status === 'loading') {
    return (
      <Box>
        {header}
        <Skeleton variant="rectangular" height={320} />
      </Box>
    );
  }
  if (weekState.status === 'error') {
    return (
      <Box>
        {header}
        <Alert severity="error">
          Couldn’t load your week: {weekState.error}
        </Alert>
      </Box>
    );
  }
  if (weekState.status === 'idle') return header;

  if (weekState.data.unlinked) {
    return (
      <Box>
        {header}
        <Alert severity="info">
          Your login isn’t linked to an instructor record yet, so there’s no
          schedule to show. Ask an admin to link your account on your instructor
          profile.
        </Alert>
      </Box>
    );
  }

  // Default missing fields to [] so a transient frontend/functions version
  // skew (they deploy as separate jobs) degrades to an empty week instead of
  // white-screening the whole page. `blocks` was added to the response in
  // #685; an older deployed getMyWeek omits it.
  const commitments = weekState.data.commitments ?? [];
  const blocks = weekState.data.blocks ?? [];
  const visible = commitments.filter((c) => !hidden.has(c.category));

  return (
    <Box>
      {header}
      {toggles}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(7, minmax(0, 1fr))',
          },
          gap: 1,
        }}
      >
        {WEEKDAY_LONG.map((dayName, dayIndex) => (
          <DayColumn
            key={dayName}
            dayName={dayName}
            date={new Date(weekStart.getTime() + dayIndex * DAY_MS)}
            blocks={blocks.filter((b) => b.dayOfWeek === dayIndex)}
            commitments={visible.filter(
              (c) => weekdayOf(c.startDateTime) === dayIndex,
            )}
            lessonHidden={hidden.has('lesson')}
          />
        ))}
      </Box>
    </Box>
  );
}

function DayColumn({
  dayName,
  date,
  blocks,
  commitments,
  lessonHidden,
}: {
  dayName: string;
  date: Date;
  blocks: MyWeekBlock[];
  commitments: MyWeekCommitment[];
  lessonHidden: boolean;
}) {
  // Lessons that sit inside a block are rendered in that block's slots; every
  // other commitment (classes, shared events, out-of-block lessons) goes to
  // "Also this day".
  const lessons = commitments.filter((c) => c.category === 'lesson');
  const inSlot = (block: MyWeekBlock, slotStart: number) =>
    lessons.find((c) => {
      const m = startMinutesOf(c.startDateTime);
      return m >= slotStart && m < slotStart + SLOT_MINUTES;
    });

  const placedIds = new Set<string>();
  const blockEls = blocks.map((block) => {
    const slots: React.ReactNode[] = [];
    for (let m = block.startMinutes; m < block.endMinutes; m += SLOT_MINUTES) {
      const lesson = inSlot(block, m);
      if (lesson) placedIds.add(lesson.id);
      slots.push(
        <Box
          key={m}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 0.5,
            py: 0.25,
            borderTop: '1px dashed',
            borderColor: 'divider',
            minHeight: 28,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ width: 56, flexShrink: 0 }}
          >
            {formatMinutes(m)}
          </Typography>
          {lesson ? (
            <CommitmentChip c={lesson} />
          ) : (
            <Typography variant="caption" color="text.disabled">
              {lessonHidden ? '—' : 'open'}
            </Typography>
          )}
        </Box>,
      );
    }
    return (
      <Box
        key={block.id}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          mb: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{ display: 'block', px: 0.5, py: 0.25, fontWeight: 600 }}
        >
          {formatMinutes(block.startMinutes)}–{formatMinutes(block.endMinutes)}
          {block.label ? ` · ${block.label}` : ''}
        </Typography>
        {slots}
      </Box>
    );
  });

  const alsoEls = commitments.filter(
    (c) => !(c.category === 'lesson' && placedIds.has(c.id)),
  );

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 0.5,
        minHeight: 80,
      }}
    >
      <Typography variant="overline" sx={{ display: 'block' }}>
        {dayName.slice(0, 3)}{' '}
        <Typography component="span" variant="caption" color="text.secondary">
          {date.toLocaleDateString(undefined, {
            month: 'numeric',
            day: 'numeric',
          })}
        </Typography>
      </Typography>

      {blockEls}

      {alsoEls.length > 0 && (
        <Box sx={{ mt: blocks.length > 0 ? 1 : 0 }}>
          {blocks.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              Also
            </Typography>
          )}
          <Stack spacing={0.5} sx={{ mt: 0.25 }}>
            {alsoEls.map((c) => (
              <CommitmentChip key={c.id} c={c} />
            ))}
          </Stack>
        </Box>
      )}

      {blocks.length === 0 && alsoEls.length === 0 && (
        <Typography variant="caption" color="text.disabled">
          —
        </Typography>
      )}
    </Box>
  );
}
