'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Collapse,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import type { ManualInvoicePaymentSource, RequestState } from '@maple/ts/domain';
import type {
  GetMyDayLessonsResponse,
  GetMyWeekResponse,
} from '@maple/ts/firebase/api-types';
import { MyWeek, MyOpenings } from '@maple/react/lessons';
import { MyDayLessonCard, type MyDayCardAction } from './MyDayLessonCard';
import { VenmoQr } from './VenmoQr';

export type MyWeekTab = 'today' | 'week' | 'openings';

/**
 * The page opens on the week. Teachers plan from the week and dip into Today
 * to mark lessons taught, so the week is what they want first.
 */
export const DEFAULT_MY_WEEK_TAB: MyWeekTab = 'week';

export interface MyWeekPageViewProps {
  dayState: RequestState<GetMyDayLessonsResponse>;
  weekState: RequestState<GetMyWeekResponse>;
  /** Local Sunday 00:00 of the displayed week. */
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onMarkRendered: (lessonId: string) => void;
  onMarkNoShow: (lessonId: string) => void;
  onRecordPayment: (
    lessonId: string,
    invoiceId: string,
    source: ManualInvoicePaymentSource,
  ) => void;
  /** Which action is running, on which lesson (legacy #805). */
  pending: { lessonId: string; action: MyDayCardAction } | null;
  /** Tab to open on. Defaults to the week. */
  initialTab?: MyWeekTab;
}

/**
 * The teacher's "My Week" page (served at `/my-day`): Week, Today and Openings
 * tabs. Hooks live in the route; this is the rendering so it can be driven in
 * Storybook.
 */
export function MyWeekPageView({
  dayState,
  weekState,
  weekStart,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onMarkRendered,
  onMarkNoShow,
  onRecordPayment,
  pending,
  initialTab = DEFAULT_MY_WEEK_TAB,
}: MyWeekPageViewProps) {
  const [tab, setTab] = useState<MyWeekTab>(initialTab);
  const [showQr, setShowQr] = useState(false);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const venmoHandle =
    dayState.status === 'success' ? dayState.data.venmoHandle : undefined;

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 1,
          mb: 1,
        }}
      >
        <Typography variant="h4" component="h1">
          My Week
        </Typography>
        <Typography variant="body1" color="textSecondary">
          {today}
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_e, v: MyWeekTab) => setTab(v)}
          aria-label="My Week view"
        >
          <Tab value="week" label="Week" />
          <Tab value="today" label="Today" />
          <Tab value="openings" label="Openings" />
        </Tabs>
      </Box>

      {tab === 'week' ? (
        <MyWeek
          weekState={weekState}
          weekStart={weekStart}
          onPrevWeek={onPrevWeek}
          onNextWeek={onNextWeek}
          onThisWeek={onThisWeek}
        />
      ) : tab === 'openings' ? (
        <MyOpenings weekState={weekState} />
      ) : (
        <>
          <Typography color="textSecondary" sx={{ mb: 3 }}>
            Your lessons today. Tap “Mark taught” after a lesson to record it;
            this never invoices or charges the student.
          </Typography>

          {venmoHandle && (
            <Box sx={{ mb: 3 }}>
              <Button
                variant="outlined"
                startIcon={<QrCode2Icon />}
                onClick={() => setShowQr((v) => !v)}
              >
                {showQr ? 'Hide' : 'Show'} Venmo QR
              </Button>
              <Collapse in={showQr}>
                <Box sx={{ mt: 2 }}>
                  <VenmoQr handle={venmoHandle} />
                </Box>
              </Collapse>
            </Box>
          )}

          {(dayState.status === 'idle' || dayState.status === 'loading') && (
            <Stack spacing={2} aria-busy="true">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rectangular" height={110} />
              ))}
            </Stack>
          )}

          {dayState.status === 'error' && (
            <Alert severity="error">
              Couldn’t load your day: {dayState.error}
            </Alert>
          )}

          {dayState.status === 'success' && dayState.data.unlinked && (
            <Alert severity="info">
              Your login isn’t linked to an instructor record yet, so there are
              no lessons to show. Ask an admin to link your account on your
              instructor profile.
            </Alert>
          )}

          {dayState.status === 'success' &&
            !dayState.data.unlinked &&
            dayState.data.lessons.length === 0 && (
              <Typography variant="body1" color="textSecondary">
                No lessons scheduled today. 🎉
              </Typography>
            )}

          {dayState.status === 'success' &&
            dayState.data.lessons.length > 0 && (
              <Stack spacing={2}>
                {dayState.data.lessons.map((item) => (
                  <MyDayLessonCard
                    key={item.lesson.id}
                    item={item}
                    onMarkRendered={onMarkRendered}
                    onMarkNoShow={onMarkNoShow}
                    onRecordPayment={(invoiceId, source) =>
                      onRecordPayment(item.lesson.id, invoiceId, source)
                    }
                    pending={
                      pending?.lessonId === item.lesson.id
                        ? pending.action
                        : null
                    }
                  />
                ))}
              </Stack>
            )}
        </>
      )}
    </>
  );
}
