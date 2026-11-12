'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { RequestStateUtil, type RequestState } from '@maple/ts/domain';
import type { StudioDayLesson } from '@maple/ts/firebase/api-types';
import { fonts, text } from '@maple/react/theme';
import { useRoles } from '@maple/react/auth';
import { useInbox, useStudioDay } from '@maple/react/data';
import { RoomStatusCard } from '@maple/react/events';
import { useClasses, useRegistrations } from '../../hooks';
import {
  ClassesThisWeekCard,
  DashboardGrid,
  InboxCard,
  RecentRegistrationsCard,
  TodayCard,
  formatLongDate,
  inboxSummarySuffix,
  todayCounts,
  todaySummaryText,
} from '../../components/dashboard';

/** The current time, ticking each minute so the NOW line and "ended" drift right. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** "Wednesday, October 14", with an optional one-line summary on the right. */
function DashboardHeader({ now, summary }: { now: Date; summary?: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        columnGap: 2,
        rowGap: 0.5,
        mb: 2.5,
      }}
    >
      <Typography
        component="h1"
        sx={{
          fontFamily: fonts.heading,
          fontSize: 32,
          lineHeight: 1.2,
          color: text.primary,
        }}
      >
        {formatLongDate(now)}
      </Typography>
      {summary && (
        <Typography color="textSecondary" sx={{ fontSize: 15 }}>
          {summary}
        </Typography>
      )}
    </Box>
  );
}

/**
 * The business dashboard (#235) — admin + clerk only, so its role-gated
 * fetches never fire for roles that would just get 403s. A clerk sees
 * classes and registrations; the studio-wide lesson day and the Inbox are
 * admin-only, and their hooks stay disabled for a clerk. Pending sync
 * conflicts are an Inbox row now, not a card of their own.
 */
function StaffDashboard({ isAdmin, now }: { isAdmin: boolean; now: Date }) {
  const { classesState } = useClasses();
  const { registrationsState } = useRegistrations();
  const { dayState } = useStudioDay(isAdmin);
  const { inboxState, dismiss, dismissError, clearDismissError } =
    useInbox(isAdmin);

  const lessonsState = useMemo<RequestState<StudioDayLesson[]> | null>(
    () => (isAdmin ? RequestStateUtil.map(dayState, (d) => d.lessons) : null),
    [isAdmin, dayState]
  );

  const summary = useMemo(() => {
    if (classesState.status !== 'success') return undefined;
    if (lessonsState && lessonsState.status !== 'success') return undefined;
    const counts = todayCounts(
      lessonsState?.status === 'success' ? lessonsState.data : null,
      classesState.data,
      now,
      // Private hours count only when booked, so the summary needs bookings.
      registrationsState.status === 'success' ? registrationsState.data : []
    );
    const inbox =
      isAdmin && inboxState.status === 'success'
        ? inboxSummarySuffix(inboxState.data.length)
        : '';
    return todaySummaryText(counts.lessons, counts.classes) + inbox;
  }, [classesState, lessonsState, inboxState, isAdmin, now, registrationsState]);

  return (
    <>
      <DashboardHeader now={now} summary={summary} />
      <DashboardGrid>
        <TodayCard
          lessonsState={lessonsState}
          classesState={classesState}
          registrationsState={registrationsState}
          now={now}
        />
        <RecentRegistrationsCard
          registrationsState={registrationsState}
          classesState={classesState}
          now={now}
        />
        {isAdmin && (
          <InboxCard
            inboxState={inboxState}
            now={now}
            onDismiss={dismiss}
            dismissError={dismissError}
            onClearDismissError={clearDismissError}
          />
        )}
        <ClassesThisWeekCard
          classesState={classesState}
          registrationsState={registrationsState}
          now={now}
        />
      </DashboardGrid>

    </>
  );
}

export default function DashboardPage() {
  const { isAdmin, roles } = useRoles();
  const isClerk = roles.includes('clerk');
  const now = useNow();

  // Teachers and other roles keep the Spruce Room status they had before.
  if (!isAdmin && !isClerk) {
    return (
      <>
        <DashboardHeader now={now} />
        <RoomStatusCard
          room="spruce"
          bookHref="/book-room"
          scheduleHref="/room-schedule"
        />
      </>
    );
  }

  return <StaffDashboard isAdmin={isAdmin} now={now} />;
}
