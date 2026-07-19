'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Collapse,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import type { ManualInvoicePaymentSource } from '@maple/ts/domain';
import { useMyDay } from '@maple/react/data';
import { MyDayLessonCard, VenmoQr } from '../../../components/my-day';

export default function MyDayPage() {
  const { dayState, markRendered, recordPayment } = useMyDay();
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const handleMarkRendered = async (lessonId: string) => {
    setBusy(true);
    try {
      await markRendered(lessonId);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordPayment = async (
    invoiceId: string,
    source: ManualInvoicePaymentSource
  ) => {
    setBusy(true);
    try {
      await recordPayment(invoiceId, source);
    } finally {
      setBusy(false);
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
      </Box>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Your lessons today. Tap “Mark rendered” after a lesson (it invoices the
        student automatically), and record a Venmo payment if they pay on the
        spot.
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
        <Alert severity="error">Couldn’t load your day: {dayState.error}</Alert>
      )}

      {dayState.status === 'success' && dayState.data.unlinked && (
        <Alert severity="info">
          Your login isn’t linked to an instructor record yet, so there are no
          lessons to show. Ask an admin to link your account on your instructor
          profile.
        </Alert>
      )}

      {dayState.status === 'success' &&
        !dayState.data.unlinked &&
        dayState.data.lessons.length === 0 && (
          <Typography variant="body1" color="text.secondary">
            No lessons scheduled today. 🎉
          </Typography>
        )}

      {dayState.status === 'success' && dayState.data.lessons.length > 0 && (
        <Stack spacing={2}>
          {dayState.data.lessons.map((item) => (
            <MyDayLessonCard
              key={item.lesson.id}
              item={item}
              onMarkRendered={handleMarkRendered}
              onRecordPayment={handleRecordPayment}
              busy={busy}
            />
          ))}
        </Stack>
      )}
    </>
  );
}
