'use client';

/**
 * MyOpenings — the teacher's open weekly lesson slots (#687, the epic payoff).
 *
 * Blocks ARE the availability model, so an opening is just the empty space in a
 * block: for each of the teacher's blocks (weekday + window) we subtract the
 * lessons already scheduled inside it and list the free intervals, labeled with
 * the lesson lengths that fit. Read-only — it answers "what standing weekly
 * slots can I offer a new student?"; booking happens from a student's page.
 *
 * Occupancy is the teacher's *recurring* lessons (this week's recurring lesson
 * commitments ∪ the standing pattern), so a one-off make-up doesn't erase a
 * standing slot. A one-off (jam/workshop/make-up) that overlaps an opening is
 * surfaced as a this-week heads-up, never a disqualifier.
 *
 * Presentational — the page owns the data (`useMyWeek`).
 */
import { useMemo } from 'react';
import { Alert, Box, Chip, Skeleton, Stack, Typography } from '@mui/material';
import type { RequestState } from '@maple/ts/domain';
import {
  DEFAULT_LESSON_TIME_ZONE,
  WEEKDAY_LONG,
  computeOpenings,
  minutesOfDayInZone,
  weekdayIndexInZone,
  type OccupiedInterval,
  type Opening,
} from '@maple/ts/domain';
import type {
  GetMyWeekResponse,
  MyWeekCommitment,
} from '@maple/ts/firebase/api-types';
import { formatMinutes } from './block-format';

export interface MyOpeningsProps {
  weekState: RequestState<GetMyWeekResponse>;
}

const TZ = DEFAULT_LESSON_TIME_ZONE;

function startMinutesOf(iso: string): number {
  return minutesOfDayInZone(new Date(iso), TZ);
}
function endMinutesOf(iso: string): number {
  const m = minutesOfDayInZone(new Date(iso), TZ);
  // An event ending at exactly midnight reads as 0 in-zone; treat as end-of-day.
  return m === 0 ? 24 * 60 : m;
}

/** The teacher's recurring lesson occupancy, projected onto a generic week. */
function occupiedIntervals(data: GetMyWeekResponse): OccupiedInterval[] {
  const fromCommitments = data.commitments
    .filter(
      (c) =>
        c.ownership === 'mine' &&
        c.category === 'lesson' &&
        c.cadence === 'recurring',
    )
    .map((c) => ({
      weekday: weekdayIndexInZone(new Date(c.startDateTime), TZ),
      startMinutes: startMinutesOf(c.startDateTime),
      endMinutes: endMinutesOf(c.endDateTime),
    }));
  const fromStanding = data.standing
    .filter((s) => s.ownership === 'mine' && s.category === 'lesson')
    .map((s) => ({
      weekday: s.weekday,
      startMinutes: s.startMinutes,
      endMinutes: s.startMinutes + s.durationMinutes,
    }));
  return [...fromCommitments, ...fromStanding];
}

interface OneOff {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  title: string;
}

/** This week's one-off commitments (make-ups, jams, workshops) for heads-ups. */
function oneOffCommitments(commitments: MyWeekCommitment[]): OneOff[] {
  return commitments
    .filter((c) => c.cadence === 'one-off')
    .map((c) => ({
      weekday: weekdayIndexInZone(new Date(c.startDateTime), TZ),
      startMinutes: startMinutesOf(c.startDateTime),
      endMinutes: endMinutesOf(c.endDateTime),
      title: c.title,
    }));
}

function overlaps(o: Opening, e: OneOff): boolean {
  return (
    e.weekday === o.weekday &&
    e.startMinutes < o.endMinutes &&
    e.endMinutes > o.startMinutes
  );
}

/** "30 · 45 · 60 min" — the fitting lesson lengths, shortest first. */
function formatDurations(fits: number[]): string {
  return `${[...fits].sort((a, b) => a - b).join(' · ')} min`;
}

export function MyOpenings({ weekState }: MyOpeningsProps) {
  const data = weekState.status === 'success' ? weekState.data : undefined;

  const openings = useMemo(
    () => (data ? computeOpenings(data.blocks, occupiedIntervals(data)) : []),
    [data],
  );
  const oneOffs = useMemo(
    () => (data ? oneOffCommitments(data.commitments) : []),
    [data],
  );

  const intro = (
    <Typography color="text.secondary" sx={{ mb: 3 }}>
      Open time inside your teaching blocks — the standing weekly slots you could
      offer a new student. Book from the student&rsquo;s page.
    </Typography>
  );

  if (weekState.status === 'loading') {
    return (
      <Box>
        {intro}
        <Stack spacing={2}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={72} />
          ))}
        </Stack>
      </Box>
    );
  }
  if (weekState.status === 'error') {
    return (
      <Box>
        {intro}
        <Alert severity="error">
          Couldn&rsquo;t load your openings: {weekState.error}
        </Alert>
      </Box>
    );
  }
  if (weekState.status === 'idle' || !data) return intro;

  if (data.unlinked) {
    return (
      <Box>
        {intro}
        <Alert severity="info">
          Your login isn&rsquo;t linked to an instructor record yet, so there are
          no blocks to find openings in. Ask an admin to link your account on
          your instructor profile.
        </Alert>
      </Box>
    );
  }

  if (data.blocks.length === 0) {
    return (
      <Box>
        {intro}
        <Alert severity="info">
          You don&rsquo;t have any lesson blocks yet. Ask an admin to set your
          weekly teaching windows and your open slots will show up here.
        </Alert>
      </Box>
    );
  }

  // Weekdays that have at least one block, in Sun–Sat order.
  const weekdaysWithBlocks = [
    ...new Set(data.blocks.map((b) => b.dayOfWeek)),
  ].sort((a, b) => a - b);

  return (
    <Box>
      {intro}
      <Stack spacing={3}>
        {weekdaysWithBlocks.map((weekday) => {
          const dayOpenings = openings.filter((o) => o.weekday === weekday);
          return (
            <Box key={weekday}>
              <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                {WEEKDAY_LONG[weekday]}
              </Typography>
              {dayOpenings.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Fully booked — no open time in your blocks.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {dayOpenings.map((o) => {
                    const clashes = oneOffs.filter((e) => overlaps(o, e));
                    return (
                      <Box
                        key={`${o.blockId}-${o.startMinutes}`}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 1,
                          p: 1.5,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                        }}
                      >
                        <Typography sx={{ fontWeight: 600 }}>
                          {formatMinutes(o.startMinutes)} –{' '}
                          {formatMinutes(o.endMinutes)}
                        </Typography>
                        <Chip
                          size="small"
                          color="info"
                          variant="outlined"
                          label={`fits ${formatDurations(o.fitsDurations)}`}
                        />
                        {clashes.map((e, i) => (
                          <Chip
                            key={i}
                            size="small"
                            color="warning"
                            variant="outlined"
                            label={`⚠ ${e.title} ${formatMinutes(
                              e.startMinutes,
                            )}–${formatMinutes(e.endMinutes)} this week`}
                          />
                        ))}
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
