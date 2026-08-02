'use client';

/**
 * MyWeek — the teacher's week as a calendar (#685).
 *
 * A calendar-style week grid: a shared hourly time axis on the left and seven
 * day columns, with items absolutely positioned by time so the same hour lines
 * up horizontally across days. A teacher's weekly blocks render as shaded
 * background bands (the teaching windows) — open time is simply the empty space
 * in a band. Categories are color-coded and can be toggled off (sticky per
 * browser).
 *
 * Two modes (#683):
 *  - "This week" projects the concrete `commitments` for the navigated week.
 *  - "Typical week" projects the synthesized `standing` slots onto a generic
 *    Sun–Sat week — the recurring pattern from the last few weeks, with
 *    one-offs dropped, so Katie can plan where a new student fits without a
 *    concrete week's cancellations/gaps getting in the way.
 *
 * Presentational — the page owns the data (`useMyWeek`) and week navigation.
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
  ToggleButton,
  ToggleButtonGroup,
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
  MyWeekOwnership,
  MyWeekStandingSlot,
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

/** Which projection of the week is shown. */
type WeekMode = 'this' | 'typical';

const CATEGORIES: CalendarEventType[] = [
  'lesson',
  'class',
  'jam',
  'event',
  'musictogether',
  'hours',
];
const STORAGE_KEY = 'myWeek.hiddenCategories';
const MODE_STORAGE_KEY = 'myWeek.mode';

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

/**
 * The unit both modes render. Concrete commitments and standing slots both
 * normalize into this so the grid, lane-packing, and styling are shared.
 */
interface WeekItem {
  id: string;
  /** Weekday 0 (Sun) – 6 (Sat), shop timezone. */
  weekday: number;
  /** Minutes from midnight, shop timezone. */
  startMin: number;
  endMin: number;
  category: CalendarEventType;
  ownership: MyWeekOwnership;
  title: string;
  /** "Needs a block" flag — only ever true for concrete lessons. */
  unattributed: boolean;
  /** A this-week-only occurrence; faded so standing items stand out. */
  oneOff: boolean;
}

function startMinutesOf(iso: string): number {
  return minutesOfDayInZone(new Date(iso), TZ);
}
function endMinutesOf(iso: string): number {
  const m = minutesOfDayInZone(new Date(iso), TZ);
  // An event ending at exactly midnight reads as 0 in-zone; treat as end-of-day.
  return m === 0 ? 24 * 60 : m;
}

/** Concrete commitment → normalized item (weekday/time resolved in-zone). */
function commitmentToItem(c: MyWeekCommitment): WeekItem {
  return {
    id: c.id,
    weekday: weekdayIndexInZone(new Date(c.startDateTime), TZ),
    startMin: startMinutesOf(c.startDateTime),
    endMin: endMinutesOf(c.endDateTime),
    category: c.category,
    ownership: c.ownership,
    title: c.title,
    unattributed: c.unattributed,
    oneOff: c.cadence === 'one-off',
  };
}

/** Standing (typical-week) slot → normalized item. Already generic-week. */
function standingToItem(s: MyWeekStandingSlot): WeekItem {
  return {
    id: s.id,
    weekday: s.weekday,
    startMin: s.startMinutes,
    endMin: s.startMinutes + s.durationMinutes,
    category: s.category,
    ownership: s.ownership,
    title: s.title,
    unattributed: false,
    oneOff: false,
  };
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
function itemSx(item: WeekItem) {
  const color: PaletteColor = item.unattributed
    ? // warning isn't in PaletteColor union but MUI resolves the token below
      ('warning' as PaletteColor)
    : CATEGORY_COLOR[item.category];
  const isDefault = color === 'default';
  const base = isDefault
    ? { bgcolor: 'grey.300', color: 'text.primary', borderColor: 'grey.400' }
    : {
        bgcolor: `${color}.main`,
        color: `${color}.contrastText`,
        borderColor: `${color}.main`,
      };
  // Shared store-wide events read as context (outlined, not filled).
  if (item.ownership === 'shared' && !item.unattributed) {
    return {
      bgcolor: 'transparent',
      color: 'text.primary',
      borderColor: isDefault ? 'grey.400' : `${color}.main`,
    };
  }
  return base;
}

type LaidOutItem = WeekItem & { lane: number };

/** Greedy lane packing so overlapping items sit side-by-side, not on top. */
function layoutDay(items: WeekItem[]): {
  laidOut: LaidOutItem[];
  laneCount: number;
} {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );

  const laneEnds: number[] = [];
  const laidOut: LaidOutItem[] = sorted.map((it) => {
    // Pack against the rendered height (min-clamped) so short items don't
    // visually overlap the next one in the same lane.
    const occupiedEnd = Math.max(it.endMin, it.startMin + MIN_ITEM_MIN);
    let lane = laneEnds.findIndex((end) => end <= it.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(occupiedEnd);
    } else {
      laneEnds[lane] = occupiedEnd;
    }
    return { ...it, lane };
  });
  return { laidOut, laneCount: Math.max(1, laneEnds.length) };
}

export function MyWeek({
  weekState,
  weekStart,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
}: MyWeekProps) {
  const [hidden, setHidden] = useState<Set<CalendarEventType>>(new Set());
  const [mode, setMode] = useState<WeekMode>('this');

  // Sticky toggle state (per browser). Read after mount to avoid SSR mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as CalendarEventType[]));
      const rawMode = localStorage.getItem(MODE_STORAGE_KEY);
      if (rawMode === 'typical' || rawMode === 'this') setMode(rawMode);
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

  const changeMode = (next: WeekMode | null) => {
    if (!next) return; // ignore de-selecting the active button
    setMode(next);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const data = weekState.status === 'success' ? weekState.data : undefined;
  const blocks = data?.blocks ?? [];

  // The items for the active mode, normalized + category-filtered.
  const visible = useMemo(() => {
    const raw =
      mode === 'typical'
        ? (data?.standing ?? []).map(standingToItem)
        : (data?.commitments ?? []).map(commitmentToItem);
    return raw.filter((i) => !hidden.has(i.category));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekState, mode, hidden]);

  // Grid bounds: the union of block windows + visible item times, snapped to
  // whole hours. Recomputed only when the inputs change.
  const [gridStart, gridEnd] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of blocks) {
      lo = Math.min(lo, b.startMinutes);
      hi = Math.max(hi, b.endMinutes);
    }
    for (const i of visible) {
      lo = Math.min(lo, i.startMin);
      hi = Math.max(hi, i.endMin);
    }
    if (!Number.isFinite(lo)) return [DEFAULT_START_MIN, DEFAULT_END_MIN];
    return [
      Math.max(0, Math.floor(lo / 60) * 60),
      Math.min(24 * 60, Math.ceil(hi / 60) * 60),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekState, visible]);

  const gridHeight = (gridEnd - gridStart) * PX_PER_MIN;
  const hours: number[] = [];
  for (let h = gridStart; h <= gridEnd; h += 60) hours.push(h);

  const modeToggle = (
    <ToggleButtonGroup
      value={mode}
      exclusive
      size="small"
      onChange={(_e, v: WeekMode | null) => changeMode(v)}
      aria-label="Week view mode"
      sx={{ mb: 2 }}
    >
      <ToggleButton value="this" aria-label="This week">
        This week
      </ToggleButton>
      <ToggleButton value="typical" aria-label="Typical week">
        Typical week
      </ToggleButton>
    </ToggleButtonGroup>
  );

  // Week navigation only makes sense for a concrete week.
  const weekNav =
    mode === 'this' ? (
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
          Today
        </Button>
        <IconButton aria-label="Next week" onClick={onNextWeek} size="small">
          <ChevronRightIcon />
        </IconButton>
        <Typography variant="subtitle1" sx={{ ml: 1, fontWeight: 600 }}>
          {formatWeekRange(weekStart)}
        </Typography>
      </Stack>
    ) : (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your recurring lessons and classes from the last few weeks, on a generic
        week. One-offs are hidden.
      </Typography>
    );

  const header = (
    <>
      {modeToggle}
      {weekNav}
    </>
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

  // Typical mode with nothing recurring yet — explain rather than show an empty
  // grid (blocks alone aren't a "typical week").
  const emptyTypical =
    mode === 'typical' && (data?.standing ?? []).length === 0;

  const columnsTemplate = `${TIME_AXIS_PX}px repeat(7, minmax(${DAY_MIN_PX}px, 1fr))`;

  return (
    <Box>
      {header}
      {toggles}

      {emptyTypical && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No recurring pattern yet. A lesson or class shows up here once it
          repeats on the same weekday and time for about two weeks.
        </Alert>
      )}

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
                {/* Concrete dates only belong to a concrete week. */}
                {mode === 'this' && (
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
                )}
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
              items={visible.filter((i) => i.weekday === dayIndex)}
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
  items,
  gridStart,
  gridEnd,
  gridHeight,
  hours,
}: {
  blocks: MyWeekBlock[];
  items: WeekItem[];
  gridStart: number;
  gridEnd: number;
  gridHeight: number;
  hours: number[];
}) {
  const { laidOut, laneCount } = layoutDay(items);

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

      {/* Positioned items */}
      {laidOut.map((item) => {
        const top = (item.startMin - gridStart) * PX_PER_MIN;
        const height =
          Math.max(item.endMin - item.startMin, MIN_ITEM_MIN) * PX_PER_MIN;
        const widthPct = 100 / laneCount;
        return (
          <Box
            key={item.id}
            title={`${formatMinutes(item.startMin)} ${item.title}`}
            sx={{
              position: 'absolute',
              top,
              height: height - 1,
              left: `calc(${item.lane * widthPct}% + 1px)`,
              width: `calc(${widthPct}% - 3px)`,
              px: 0.5,
              py: 0.1,
              borderRadius: 0.75,
              border: '1px solid',
              overflow: 'hidden',
              fontSize: 11,
              lineHeight: 1.25,
              cursor: 'default',
              opacity: item.oneOff ? 0.55 : 1,
              ...itemSx(item),
            }}
          >
            <Box
              component="span"
              sx={{
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {formatMinutes(item.startMin)}
            </Box>{' '}
            <Box component="span">
              {item.unattributed ? '⚠ ' : ''}
              {item.title}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
