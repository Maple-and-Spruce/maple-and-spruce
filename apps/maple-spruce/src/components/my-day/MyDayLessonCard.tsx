'use client';

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import type { ManualInvoicePaymentSource } from '@maple/ts/domain';
import type { MyDayLesson } from '@maple/ts/firebase/api-types';
import { formatCents } from '@maple/react/lessons';

interface MyDayLessonCardProps {
  item: MyDayLesson;
  onMarkRendered: (lessonId: string) => void;
  onRecordPayment: (
    invoiceId: string,
    source: ManualInvoicePaymentSource
  ) => void;
  busy?: boolean;
}

function timeLabel(value: Date | string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function MyDayLessonCard({
  item,
  onMarkRendered,
  onRecordPayment,
  busy = false,
}: MyDayLessonCardProps) {
  const { lesson, studentName, invoice } = item;
  const isScheduled = lesson.status === 'scheduled';
  const isPaid = invoice?.status === 'paid';
  const isUnpaid = invoice?.status === 'sent';

  return (
    <Card variant="outlined">
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Box>
            <Typography variant="h6" component="span">
              {timeLabel(lesson.scheduledAt)}
            </Typography>{' '}
            <Typography variant="body1" component="span">
              {studentName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {lesson.durationMinutes}-min lesson
            </Typography>
          </Box>
          <Chip
            label={lesson.status}
            size="small"
            color={
              lesson.status === 'rendered'
                ? 'success'
                : lesson.status === 'cancelled'
                  ? 'default'
                  : 'info'
            }
            variant={lesson.status === 'rendered' ? 'filled' : 'outlined'}
          />
        </Box>

        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}
          alignItems="center"
        >
          {isScheduled && (
            <Button
              variant="contained"
              size="small"
              startIcon={<CheckCircleIcon />}
              disabled={busy}
              onClick={() => onMarkRendered(lesson.id)}
            >
              Mark rendered
            </Button>
          )}

          {isPaid && invoice && (
            <Chip
              icon={<CheckCircleIcon />}
              color="success"
              variant="outlined"
              size="small"
              label={`Paid ${formatCents(invoice.totalCents)}${
                invoice.source?.startsWith('venmo') ? ' · Venmo' : ''
              }`}
            />
          )}

          {isUnpaid && invoice && (
            <>
              <Typography variant="body2" color="text.secondary">
                {formatCents(invoice.totalCents)} due
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AccountBalanceWalletIcon />}
                disabled={busy}
                onClick={() => onRecordPayment(invoice.id, 'venmo-manual')}
              >
                Record Venmo
              </Button>
              <Button
                variant="text"
                size="small"
                disabled={busy}
                onClick={() => onRecordPayment(invoice.id, 'admin-manual')}
              >
                Cash / check
              </Button>
            </>
          )}

          {!invoice && !isScheduled && (
            <Typography variant="body2" color="text.secondary">
              No invoice yet.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
