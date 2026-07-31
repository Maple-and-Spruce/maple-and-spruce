'use client';

/**
 * MyWeek — the teacher's week as a calendar (#685).
 *
 * A calendar-style week grid: a shared hourly time axis on the left and seven
 * day columns, with commitments absolutely positioned by time so the same hour
 * lines up horizontally across days. A teacher's weekly blocks render as shaded
 * background bands (the teaching windows) — open time is simply the empty space
 * in a band. Categories are color-coded and can be toggled off (sticky per
 * browser). Presentational — the page owns the data (`useMyWeek`) and week
 * navigation.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import type { CalendarEventType, RequestState } from '@maple/ts/domain';
import {
  DEFAULT_LESSON_TIME_ZONE,
  WEEKDAY_SHORT,
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
const TZ = DEFAULT_LESSON_TIME_ZONE;
const PX_PER_MIN = 1; // 60px per hour
const MIN_ITEM_MIN = 24; // minimum rendered height so short items stay readable
const TIME_AXIS_PX = 52;
const DAY_MIN_PX = 116; // min day-column width before horizontal scroll kicks in
const DEFAULT_START_MIN = 9 * 60;
const DEFAULT_END_MIN = 18 * 60;

const CATEGORIES: CalendarEventType[] = [
  'lesson',
  'class',
  'jam',
  'event',
  'musictogether',
  'hours',
];
const STORAGE_KEY = 'myWeek.hiddenCategories';

type PaletteColor = 'default' | 'primary' | 'secondary' | 'info' | 'success';

/** Category → MUI palette color (mirrors the RoomScheduleAgenda convention). */
const CATEGORY_COLOR: Record<CalendarEventType, PaletteColor> = {
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
function endMinutesOf(iso: string): number {
  const m = minutesOfDayInZone(new Date(iso), TZ);
  // An event ending at exactly midnight reads as 0 in-zone; treat as end-of-day.
  return m === 0 ? 24 * 60 : m;
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

/** "11 AM", "12 PM" — hour-only label for the time axis. */
function formatHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

/** Fill/border style for an item box from its category + ownership + flags. */
function itemSx(c: MyWeekCommitment) {
  const color: PaletteColor = c.unattributed
    ? // warning isn't in PaletteColor union but MUI resolves the token below
      ('warning' as PaletteColor)
    : CATEGORY_COLOR[c.category];
  const isDefault = color === 'default';
  const base = isDefault
    ? { bgcolor: 'grey.300', color: 'text.primary', borderColor: 'grey.400' }
    : {
        bgcolor: `${color}.main`,
        color: `${color}.contrastText`,
        borderColor: `${color}.main`,
      };
  // Shared store-wide events read as context (outlined, not filled).
  if (c.ownership === 'shared' && !c.unattributed) {
    return {
      bgcolor: 'transparent',
      color: 'text.primary',
      borderColor: isDefault ? 'grey.400' : `${color}.main`,
    };
  }
  return base;
}

interface LaidOutItem {
  c: MyWeekCommitment;
  startMin: number;
  endMin: number;
  lane: number;
}

/** Greedy lane packing so overlapping items sit side-by-side, not on top. */
function layoutDay(commitments: MyWeekCommitment[]): {
  items: LaidOutItem[];
  laneCount: number;
} {
  const sorted = commitments
    .map((c) => ({
      c,
      startMin: startMinutesOf(c.startDateTime),
      endMin: Math.max(
        endMinutesOf(c.endDateTime),
        startMinutesOf(c.startDateTime) + MIN_ITEM_MIN,
      ),
    }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const laneEnds: number[] = [];
  const items: LaidOutItem[] = sorted.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.endMin);
    } else {
      laneEnds[lane] = it.endMin;
    }
    return { ...it, lane };
  });
  return { items, laneCount: Math.max(1, laneEnds.length) };
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

  const data = weekState.status === 'success' ? weekState.data : undefined;
  const commitments = data?.commitments ?? [];
  const blocks = data?.blocks ?? [];
  const visible = commitments.filter((c) => !hidden.has(c.category));

  // Grid bounds: the union of block windows + visible commitment times, snapped
  // to whole hours. Recomputed only when the inputs change.
  const [gridStart, gridEnd] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of blocks) {
      lo = Math.min(lo, b.startMinutes);
      hi = Math.max(hi, b.endMinutes);
    }
    for (const c of visible) {
      lo = Math.min(lo, startMinutesOf(c.startDateTime));
      hi = Math.max(hi, endMinutesOf(c.endDateTime));
    }
    if (!Number.isFinite(lo)) return [DEFAULT_START_MIN, DEFAULT_END_MIN];
    return [
      Math.max(0, Math.floor(lo / 60) * 60),
      Math.min(24 * 60, Math.ceil(hi / 60) * 60),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekState, hidden]);

  const gridHeight = (gridEnd - gridStart) * PX_PER_MIN;
  const hours: number[] = [];
  for (let h = gridStart; h <= gridEnd; h += 60) hours.push(h);

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
    <Stack direction="row" flexWrap="wrap" sx={{ mb: 2, gap: 1 }}>
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
        <Skeleton variant="rectangular" height={360} />
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

  if (data?.unlinked) {
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

  const columnsTemplate = `${TIME_AXIS_PX}px repeat(7, minmax(${DAY_MIN_PX}px, 1fr))`;

  return (
    <Box>
      {header}
      {toggles}

      <Box sx={{ overflowX: 'auto', pb: 1 }}>
        {/* Day-of-week header row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: columnsTemplate,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box />
          {WEEKDAY_SHORT.map((short, dayIndex) => {
            const date = new Date(weekStart.getTime() + dayIndex * DAY_MS);
            return (
              <Box
                key={short}
                sx={{
                  textAlign: 'center',
                  py: 0.5,
                  borderLeft: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="overline" sx={{ lineHeight: 1.2 }}>
                  {short}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block' }}
                >
                  {date.toLocaleDateString(undefined, {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Time grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: columnsTemplate,
            position: 'relative',
          }}
        >
          {/* Time axis */}
          <Box sx={{ position: 'relative', height: gridHeight }}>
            {hours.map((h) => (
              <Typography
                key={h}
                variant="caption"
                color="text.secondary"
                sx={{
                  position: 'absolute',
                  top: (h - gridStart) * PX_PER_MIN - 8,
                  right: 6,
                }}
              >
                {formatHour(h)}
              </Typography>
            ))}
          </Box>

          {/* Day columns */}
          {WEEKDAY_SHORT.map((short, dayIndex) => (
            <DayColumn
              key={short}
              blocks={blocks.filter((b) => b.dayOfWeek === dayIndex)}
              commitments={visible.filter(
                (c) => weekdayOf(c.startDateTime) === dayIndex,
              )}
              gridStart={gridStart}
              gridEnd={gridEnd}
              gridHeight={gridHeight}
              hours={hours}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function DayColumn({
  blocks,
  commitments,
  gridStart,
  gridEnd,
  gridHeight,
  hours,
}: {
  blocks: MyWeekBlock[];
  commitments: MyWeekCommitment[];
  gridStart: number;
  gridEnd: number;
  gridHeight: number;
  hours: number[];
}) {
  const { items, laneCount } = layoutDay(commitments);

  return (
    <Box
      sx={{
        position: 'relative',
        height: gridHeight,
        borderLeft: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Hour gridlines */}
      {hours.map((h) => (
        <Box
          key={h}
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: (h - gridStart) * PX_PER_MIN,
            borderTop: '1px solid',
            borderColor: 'divider',
            opacity: 0.5,
          }}
        />
      ))}

      {/* Block bands (teaching windows) behind the items */}
      {blocks.map((b) => {
        const top =
          (Math.max(b.startMinutes, gridStart) - gridStart) * PX_PER_MIN;
        const height =
          (Math.min(b.endMinutes, gridEnd) -
            Math.max(b.startMinutes, gridStart)) *
          PX_PER_MIN;
        if (height <= 0) return null;
        return (
          <Box
            key={b.id}
            title={`${formatMinutes(b.startMinutes)}–${formatMinutes(
              b.endMinutes,
            )}${b.label ? ` · ${b.label}` : ''}`}
            sx={{
              position: 'absolute',
              left: 1,
              right: 1,
              top,
              height,
              bgcolor: 'action.hover',
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 0.5,
            }}
          />
        );
      })}

      {/* Positioned commitments */}
      {items.map(({ c, startMin, endMin, lane }) => {
        const top = (startMin - gridStart) * PX_PER_MIN;
        const height = Math.max(endMin - startMin, MIN_ITEM_MIN) * PX_PER_MIN;
        const widthPct = 100 / laneCount;
        return (
          <Box
            key={c.id}
            title={`${formatMinutes(startMin)} ${c.title}`}
            sx={{
              position: 'absolute',
              top,
              height: height - 1,
              left: `calc(${lane * widthPct}% + 1px)`,
              width: `calc(${widthPct}% - 3px)`,
              px: 0.5,
              py: 0.1,
              borderRadius: 0.75,
              border: '1px solid',
              overflow: 'hidden',
              fontSize: 11,
              lineHeight: 1.25,
              cursor: 'default',
              opacity: c.cadence === 'one-off' ? 0.55 : 1,
              ...itemSx(c),
            }}
          >
            <Box
              component="span"
              sx={{
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {formatMinutes(startMin)}
            </Box>{' '}
            <Box component="span">
              {c.unattributed ? '⚠ ' : ''}
              {c.title}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
