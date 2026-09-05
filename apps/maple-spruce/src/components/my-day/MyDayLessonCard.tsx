'use client';

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import type { ManualInvoicePaymentSource } from '@maple/ts/domain';
import type { MyDayLesson } from '@maple/ts/firebase/api-types';
import { formatCents } from '@maple/react/lessons';

/** An action a card can have in flight. */
export type MyDayCardAction =
  | 'mark-rendered'
  | 'mark-no-show'
  | ManualInvoicePaymentSource;

interface MyDayLessonCardProps {
  item: MyDayLesson;
  onMarkRendered: (lessonId: string) => void;
  /** Nobody came. Charged for private pay, charged to nobody for Hope (#796). */
  onMarkNoShow: (lessonId: string) => void;
  onRecordPayment: (
    invoiceId: string,
    source: ManualInvoicePaymentSource
  ) => void;
  /**
   * The action in flight on THIS card, if any.
   *
   * Replaces a page-wide `busy` boolean, which disabled every card in the day
   * while one was saving and never said which action was running (#805).
   */
  pending?: MyDayCardAction | null;
}

/**
 * The stored status is `rendered` — "services rendered" — but no teacher says
 * that, and Katie read it as jargon. On screen it is **taught**; the stored
 * value is unchanged.
 */
function statusLabel(status: MyDayLesson['lesson']['status']): string {
  return status === 'rendered' ? 'taught' : status;
}

/** Distinct colours per status — a no-show is neither a success nor a nothing. */
function statusChipColor(
  status: MyDayLesson['lesson']['status']
): 'success' | 'warning' | 'default' | 'info' {
  if (status === 'rendered') return 'success';
  if (status === 'no-show') return 'warning';
  if (status === 'cancelled') return 'default';
  return 'info';
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
  onMarkNoShow,
  onRecordPayment,
  pending = null,
}: MyDayLessonCardProps) {
  const busy = Boolean(pending);
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
            label={statusLabel(lesson.status)}
            size="small"
            color={statusChipColor(lesson.status)}
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
              startIcon={
                pending === 'mark-rendered' ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <CheckCircleIcon />
                )
              }
              disabled={busy}
              onClick={() => onMarkRendered(lesson.id)}
            >
              {pending === 'mark-rendered' ? 'Marking…' : 'Mark taught'}
            </Button>
          )}

          {/* The other half of the same question. Two taps stays two taps. */}
          {isScheduled && (
            <Button
              variant="outlined"
              size="small"
              color="warning"
              startIcon={
                pending === 'mark-no-show' ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <PersonOffIcon />
                )
              }
              disabled={busy}
              onClick={() => onMarkNoShow(lesson.id)}
            >
              {pending === 'mark-no-show' ? 'Saving…' : 'No-show'}
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
                startIcon={
                  pending === 'venmo-manual' ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <AccountBalanceWalletIcon />
                  )
                }
                disabled={busy}
                onClick={() => onRecordPayment(invoice.id, 'venmo-manual')}
              >
                {pending === 'venmo-manual' ? 'Recording…' : 'Record Venmo'}
              </Button>
              {/* Outlined, not text: this records a payment, and a text button
                  reads as a link rather than as an action. */}
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  pending === 'admin-manual' ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : null
                }
                disabled={busy}
                onClick={() => onRecordPayment(invoice.id, 'admin-manual')}
              >
                {pending === 'admin-manual' ? 'Recording…' : 'Cash / check'}
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
