'use client';

import { Fragment, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { fonts, text } from '@maple/react/theme';
import type { Class, Registration, RequestState } from '@maple/ts/domain';
import type { StudioDayLesson } from '@maple/ts/firebase/api-types';
import {
  DashboardCard,
  DashboardCardEmpty,
  DashboardCardError,
  DashboardCardSkeleton,
  DashboardChip,
  DashboardRow,
  dashboardColors,
  ellipsis,
} from './DashboardCard';
import {
  agendaFooterText,
  buildAgenda,
  combinedStatus,
  formatClock,
  formatClockShort,
  type AgendaItem,
} from './dashboard-view';

export interface TodayCardProps {
  /**
   * Every teacher's lessons today, or `null` for a viewer who does not see
   * lessons (a clerk) — the timeline is then classes only.
   */
  lessonsState: RequestState<StudioDayLesson[]> | null;
  classesState: RequestState<Class[]>;
  /** For each class's seat count. */
  registrationsState: RequestState<Registration[]>;
  now: Date;
}

function Rail({ kind }: { kind: AgendaItem['kind'] }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 4,
        alignSelf: 'stretch',
        borderRadius: 2,
        flexShrink: 0,
        bgcolor:
          kind === 'lesson' ? dashboardColors.lessonRail : dashboardColors.classRail,
      }}
    />
  );
}

function AgendaRow({ item }: { item: AgendaItem }) {
  return (
    <DashboardRow href={item.href}>
      <Box
        sx={{
          width: 64,
          flexShrink: 0,
          fontFamily: fonts.button,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.3,
        }}
      >
        <Box sx={{ fontSize: 14, fontWeight: 600, color: text.primary }}>
          {formatClock(item.start)}
        </Box>
        <Box sx={{ fontSize: 12, color: text.secondary }}>
          {formatClock(item.end)}
        </Box>
      </Box>
      <Rail kind={item.kind} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ ...ellipsis, fontSize: 15, color: text.primary }}>
          {item.title}
        </Typography>
        <Typography
          color="textSecondary"
          sx={{ ...ellipsis, fontSize: 13 }}
        >
          {item.detail}
        </Typography>
      </Box>
      <DashboardChip label={item.chip.label} tone={item.chip.tone} />
    </DashboardRow>
  );
}

function NowLine({ now }: { now: Date }) {
  const label = `NOW ${formatClockShort(now)}`;
  return (
    <Box
      role="separator"
      aria-label={label}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2.5,
        py: 0.5,
        color: dashboardColors.clay,
        fontFamily: fonts.button,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bgcolor: dashboardColors.clay,
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
      <Box
        aria-hidden
        sx={{ flex: 1, height: '1px', bgcolor: alpha(dashboardColors.clay, 0.5) }}
      />
    </Box>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        component="span"
        aria-hidden
        sx={{ width: 4, height: 12, borderRadius: 2, bgcolor: color }}
      />
      {label}
    </Box>
  );
}

/**
 * Today (#235): the studio's lessons and class sessions merged on one
 * timeline, with a NOW line, finished items dropped and the rest capped.
 */
export function TodayCard({
  lessonsState,
  classesState,
  registrationsState,
  now,
}: TodayCardProps) {
  const status = combinedStatus(
    lessonsState
      ? [lessonsState, classesState, registrationsState]
      : [classesState, registrationsState],
  );

  const view = useMemo(() => {
    if (status.status !== 'success') return null;
    if (classesState.status !== 'success') return null;
    if (registrationsState.status !== 'success') return null;
    const lessons =
      lessonsState && lessonsState.status === 'success' ? lessonsState.data : null;
    return buildAgenda(lessons, classesState.data, registrationsState.data, now);
  }, [status.status, lessonsState, classesState, registrationsState, now]);

  const footerCounts = view ? agendaFooterText(view) : '';
  const footer = (
    <>
      <Box sx={{ display: 'flex', gap: 1.75 }}>
        {lessonsState && (
          <LegendSwatch color={dashboardColors.lessonRail} label="Lesson" />
        )}
        <LegendSwatch color={dashboardColors.classRail} label="Class" />
      </Box>
      {footerCounts && <span>{footerCounts}</span>}
    </>
  );

  let body;
  if (status.status === 'error') {
    body = <DashboardCardError message={`Couldn't load today: ${status.error}`} />;
  } else if (!view) {
    body = <DashboardCardSkeleton rows={4} />;
  } else if (view.totalCount === 0) {
    body = <DashboardCardEmpty message="Nothing scheduled today" />;
  } else if (view.items.length === 0) {
    body = <DashboardCardEmpty message="All done for today" />;
  } else {
    body = (
      <Box sx={{ '& > a:first-of-type': { borderTop: 'none' } }}>
        {view.items.map((item, i) => (
          <Fragment key={item.id}>
            {i === view.nowIndex && <NowLine now={now} />}
            <AgendaRow item={item} />
          </Fragment>
        ))}
        {view.nowIndex === view.items.length && <NowLine now={now} />}
      </Box>
    );
  }

  return (
    <DashboardCard
      title="Today"
      link={{ label: 'My week', href: '/my-day' }}
      footer={footer}
    >
      {body}
    </DashboardCard>
  );
}
