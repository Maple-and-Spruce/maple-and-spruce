'use client';

import { useMemo, useState } from 'react';
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
import type { ManualInvoicePaymentSource } from '@maple/ts/domain';
import { useMyDay, useMyWeek, useNeedsAttention } from '@maple/react/data';
import {
  MyWeek,
  MyOpenings,
  NeedsAttentionPanel,
} from '@maple/react/lessons';
import {
  MyDayLessonCard,
  VenmoQr,
  type MyDayCardAction,
} from '../../../components/my-day';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local Sunday 00:00 for a given instant. */
function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

type MyDayTab = 'today' | 'week' | 'openings';

export default function MyDayPage() {
  const { dayState, markRendered, markNoShow, recordPayment } = useMyDay();
  const {
    attentionState,
    resolveRow: resolveAttentionRow,
    resolving: attentionResolving,
  } = useNeedsAttention();
  /**
   * Which action is running, on which lesson. Was a single page-wide boolean,
   * which froze every card in the day while one saved and never said which
   * action was in flight (#805).
   */
  const [pending, setPending] = useState<{
    lessonId: string;
    action: MyDayCardAction;
  } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [tab, setTab] = useState<MyDayTab>('today');
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(
    () => new Date(startOfWeek(new Date()).getTime() + weekOffset * 7 * DAY_MS),
    [weekOffset],
  );
  const { weekState } = useMyWeek(weekStart);

  const handleMarkRendered = async (lessonId: string) => {
    setPending({ lessonId, action: 'mark-rendered' });
    try {
      await markRendered(lessonId);
    } finally {
      setPending(null);
    }
  };

  const handleMarkNoShow = async (lessonId: string) => {
    setPending({ lessonId, action: 'mark-no-show' });
    try {
      await markNoShow(lessonId);
    } finally {
      setPending(null);
    }
  };

  const handleRecordPayment = async (
    lessonId: string,
    invoiceId: string,
    source: ManualInvoicePaymentSource,
  ) => {
    setPending({ lessonId, action: source });
    try {
      await recordPayment(invoiceId, source);
    } finally {
      setPending(null);
    }
  };

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
          My Day
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {today}
        </Typography>

      {/* Self-scoped for a lesson teacher; renders nothing when clear (#807). */}
      {attentionState.status === 'success' && (
        <NeedsAttentionPanel
          groups={attentionState.data.groups}
          total={attentionState.data.total}
          scopedToSelf={attentionState.data.scopedToSelf}
          resolving={attentionResolving}
          onResolve={resolveAttentionRow}
        />
      )}
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_e, v: MyDayTab) => setTab(v)}
          aria-label="My Day view"
        >
          <Tab value="today" label="Today" />
          <Tab value="week" label="Week" />
          <Tab value="openings" label="Openings" />
        </Tabs>
      </Box>

      {tab === 'week' ? (
        <MyWeek
          weekState={weekState}
          weekStart={weekStart}
          onPrevWeek={() => setWeekOffset((o) => o - 1)}
          onNextWeek={() => setWeekOffset((o) => o + 1)}
          onThisWeek={() => setWeekOffset(0)}
        />
      ) : tab === 'openings' ? (
        <MyOpenings weekState={weekState} />
      ) : (
        <>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Your lessons today. Tap “Mark rendered” after a lesson (it invoices
            the student automatically), and record a Venmo payment if they pay
            on the spot.
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

          {dayState.status === 'loading' && (
            <Stack spacing={2}>
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
              <Typography variant="body1" color="text.secondary">
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
                    onMarkRendered={handleMarkRendered}
                    onMarkNoShow={handleMarkNoShow}
                    onRecordPayment={(invoiceId, source) =>
                      handleRecordPayment(item.lesson.id, invoiceId, source)
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
