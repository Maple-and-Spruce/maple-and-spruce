'use client';

import Link from 'next/link';
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
import type { ManualInvoicePaymentSource } from '@maple/ts/domain';
import type { MyDayLesson } from '@maple/ts/firebase/api-types';
import { formatCents } from '@maple/react/lessons';

/** An action a card can have in flight. */
export type MyDayCardAction = ManualInvoicePaymentSource;

interface MyDayLessonCardProps {
  item: MyDayLesson;
  /**
   * Where the student's name leads: their Next lessons tab, where Katie books
   * the next four and takes payment (#160). Omit to show a plain name.
   */
  studentHref?: string;
  onRecordPayment: (
    invoiceId: string,
    source: ManualInvoicePaymentSource
  ) => void;
  /**
   * The action in flight on THIS card, if any.
   *
   * Replaces a page-wide `busy` boolean, which disabled every card in the day
   * while one was saving and never said which action was running (legacy #805).
   */
  pending?: MyDayCardAction | null;
}

function timeLabel(value: Date | string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function MyDayLessonCard({
  item,
  studentHref,
  onRecordPayment,
  pending = null,
}: MyDayLessonCardProps) {
  const busy = Boolean(pending);
  const { lesson, studentName, invoice } = item;
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
            {studentHref ? (
              <Typography
                variant="body1"
                component={Link}
                href={studentHref}
                sx={{ color: 'primary.main', fontWeight: 600 }}
              >
                {studentName}
              </Typography>
            ) : (
              <Typography variant="body1" component="span">
                {studentName}
              </Typography>
            )}
            <Typography variant="body2" color="textSecondary">
              {lesson.durationMinutes}-min lesson
            </Typography>
          </Box>
        </Box>

        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            mt: 2,
            flexWrap: 'wrap',
            gap: 1
          }}>
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
              <Typography variant="body2" color="textSecondary">
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

        </Stack>
      </CardContent>
    </Card>
  );
}
