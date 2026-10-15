'use client';

import { useMemo } from 'react';
import NextLink from 'next/link';
import { Box, Link, Typography } from '@mui/material';
import { colors, fonts, text } from '@maple/react/theme';
import type { Class, Registration, RequestState } from '@maple/ts/domain';
import {
  DashboardCard,
  DashboardCardEmpty,
  DashboardCardError,
  DashboardCardSkeleton,
  DashboardChip,
  DashboardRow,
  ellipsis,
} from './DashboardCard';
import {
  buildRecentRegistrations,
  combinedStatus,
  formatMoney,
} from './dashboard-view';

export interface RecentRegistrationsCardProps {
  registrationsState: RequestState<Registration[]>;
  /** For each registration's class name and date. */
  classesState: RequestState<Class[]>;
  now: Date;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75 }}>
      <Box
        component="strong"
        sx={{
          fontFamily: fonts.button,
          fontSize: 20,
          fontWeight: 600,
          color: text.primary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Box>
      <Typography component="span" color="textSecondary" sx={{ fontSize: 14 }}>
        {label}
      </Typography>
    </Box>
  );
}

/** Recent registrations (#235): this week's totals and the latest five. */
export function RecentRegistrationsCard({
  registrationsState,
  classesState,
  now,
}: RecentRegistrationsCardProps) {
  const status = combinedStatus([registrationsState, classesState]);
  const view = useMemo(() => {
    if (registrationsState.status !== 'success') return null;
    if (classesState.status !== 'success') return null;
    return buildRecentRegistrations(registrationsState.data, classesState.data, now);
  }, [registrationsState, classesState, now]);

  let body;
  if (status.status === 'error') {
    body = (
      <DashboardCardError message={`Couldn't load registrations: ${status.error}`} />
    );
  } else if (!view) {
    body = <DashboardCardSkeleton />;
  } else if (view.weekCount === 0) {
    body = <DashboardCardEmpty message="No registrations this week" />;
  } else {
    body = (
      <>
        <Box sx={{ display: 'flex', gap: 3, px: 2.5, pb: 1 }}>
          <Stat value={String(view.weekCount)} label="this week" />
          <Stat value={formatMoney(view.weekBookedCents)} label="booked" />
        </Box>
        {view.rows.map((row) => (
          <DashboardRow key={row.id} href="/registrations">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Typography sx={{ ...ellipsis, fontSize: 15, color: text.primary }}>
                  {row.name}
                </Typography>
                {row.isNew && <DashboardChip label="New" tone="class" />}
              </Box>
              <Typography color="textSecondary" sx={{ ...ellipsis, fontSize: 13 }}>
                {row.detail}
              </Typography>
            </Box>
            <Box
              sx={{
                textAlign: 'right',
                flexShrink: 0,
                fontFamily: fonts.button,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.3,
              }}
            >
              <Box sx={{ fontSize: 14, fontWeight: 600, color: text.primary }}>
                {row.amount}
              </Box>
              <Box sx={{ fontSize: 12, color: text.secondary }}>{row.when}</Box>
            </Box>
          </DashboardRow>
        ))}
      </>
    );
  }

  const footer =
    view && view.weekCount > 0 ? (
      <Link
        component={NextLink}
        href="/registrations"
        underline="hover"
        sx={{ fontFamily: fonts.button, fontSize: 13, color: colors.sageGreenDark }}
      >
        View all {view.weekCount} this week →
      </Link>
    ) : undefined;

  return (
    <DashboardCard
      title="Recent registrations"
      link={{ label: 'All', href: '/registrations' }}
      footer={footer}
    >
      {body}
    </DashboardCard>
  );
}
