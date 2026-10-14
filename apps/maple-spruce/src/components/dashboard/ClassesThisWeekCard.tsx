'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { colors, fonts, text } from '@maple/react/theme';
import type { Class, Registration, RequestState } from '@maple/ts/domain';
import {
  DashboardCard,
  DashboardCardEmpty,
  DashboardCardError,
  DashboardCardSkeleton,
  DashboardRow,
  dashboardColors,
  ellipsis,
} from './DashboardCard';
import { buildClassesThisWeek, combinedStatus } from './dashboard-view';

export interface ClassesThisWeekCardProps {
  classesState: RequestState<Class[]>;
  /** For each class's seat count. */
  registrationsState: RequestState<Registration[]>;
  now: Date;
}

/** Classes this week (#235): what runs in the next 7 days and how full it is. */
export function ClassesThisWeekCard({
  classesState,
  registrationsState,
  now,
}: ClassesThisWeekCardProps) {
  const status = combinedStatus([classesState, registrationsState]);
  const view = useMemo(() => {
    if (classesState.status !== 'success') return null;
    if (registrationsState.status !== 'success') return null;
    return buildClassesThisWeek(classesState.data, registrationsState.data, now);
  }, [classesState, registrationsState, now]);

  let body;
  if (status.status === 'error') {
    body = <DashboardCardError message={`Couldn't load classes: ${status.error}`} />;
  } else if (!view) {
    body = <DashboardCardSkeleton />;
  } else if (view.rows.length === 0) {
    body = <DashboardCardEmpty message="No classes this week" />;
  } else {
    body = (
      <Box sx={{ '& > a:first-of-type': { borderTop: 'none' } }}>
        {view.rows.map((row) => {
          const accent = row.low ? dashboardColors.amber : colors.sageGreen;
          return (
            <DashboardRow key={row.id} href={`/classes/${row.id}`}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
                  <Typography
                    sx={{ ...ellipsis, flex: 1, fontSize: 15, color: text.primary }}
                  >
                    {row.name}
                  </Typography>
                  <Box
                    data-low={row.low ? 'true' : undefined}
                    sx={{
                      flexShrink: 0,
                      fontFamily: fonts.button,
                      fontSize: 13,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: row.low ? dashboardColors.amber : text.primary,
                    }}
                  >
                    {row.filled}/{row.capacity}
                  </Box>
                </Box>
                <Box
                  role="progressbar"
                  aria-label={`${row.name}: ${row.filled} of ${row.capacity} seats filled`}
                  aria-valuemin={0}
                  aria-valuemax={row.capacity}
                  aria-valuenow={Math.min(row.filled, row.capacity)}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: colors.creamLight,
                    overflow: 'hidden',
                    my: 0.75,
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${Math.round(row.fillRatio * 100)}%`,
                      bgcolor: accent,
                      borderRadius: 3,
                    }}
                  />
                </Box>
                <Typography color="textSecondary" sx={{ ...ellipsis, fontSize: 13 }}>
                  {row.detail}
                </Typography>
              </Box>
            </DashboardRow>
          );
        })}
      </Box>
    );
  }

  const footer =
    view && view.rows.length > 0 ? (
      <span>
        {view.openSeats} {view.openSeats === 1 ? 'seat' : 'seats'} open across{' '}
        {view.rows.length} {view.rows.length === 1 ? 'class' : 'classes'}
      </span>
    ) : undefined;

  return (
    <DashboardCard
      title="Classes this week"
      link={{ label: 'All classes', href: '/classes' }}
      footer={footer}
    >
      {body}
    </DashboardCard>
  );
}
