'use client';

/**
 * The five minutes at the end of a lesson (#158).
 *
 * Katie books the student's next four lessons and takes payment, about one
 * lesson in four, standing with the family. So this shows only what she needs
 * to confirm — the four dates and what they cost — and one button. Everything
 * else about the student lives on the other tabs.
 *
 * Presentational: the page owns booking and payment, and passes the result of
 * `buildNextLessons` in.
 */
import { useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { SCHEDULE_TIME_ZONE } from '@maple/ts/domain';
import type { RequestState } from '@maple/ts/domain';
import type { NextLessonItem, NextLessonsView } from '@maple/ts/domain';

export interface NextLessonsPanelProps {
  viewState: RequestState<NextLessonsView>;
  /** What one lesson of each item's length costs; 0 when no rate is set. */
  priceOf: (item: NextLessonItem) => number;
  /** Hope students are billed through EMA: book only, never charge. */
  isHope: boolean;
  /** The linked card, described ("Visa ••4242"); undefined when there is none. */
  cardLabel?: string;
  busy: boolean;
  error?: string | null;
  /**
   * What just happened, after a successful booking or payment. While it is
   * set the panel shows only this: proposing the *following* four with a
   * second Charge button straight after a payment invites charging twice.
   */
  notice?: string | null;
  /** Dismiss the notice and propose the next lessons again. */
  onBookMore: () => void;
  onMove: (item: NextLessonItem, to: Date) => void;
  onCharge: () => void;
  onInvoice: () => void;
  onBook: () => void;
  onSetWeeklyTime: () => void;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatWhen(at: Date): string {
  return at.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

/** "Oct 6, Nov 3 and Nov 17", in the studio's timezone. */
function dateList(items: NextLessonItem[]): string {
  const labels = items.map((item) =>
    item.scheduledAt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: SCHEDULE_TIME_ZONE,
    })
  );
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export function NextLessonsPanel({
  viewState,
  priceOf,
  isHope,
  cardLabel,
  busy,
  error,
  notice,
  onMove,
  onCharge,
  onInvoice,
  onBook,
  onSetWeeklyTime,
  onBookMore,
}: NextLessonsPanelProps) {
  const [moving, setMoving] = useState<NextLessonItem | null>(null);
  const [moveTo, setMoveTo] = useState<Date | null>(null);
  /** Money moves only after a second, deliberate press. */
  const [confirming, setConfirming] = useState<'charge' | 'invoice' | null>(
    null
  );

  if (viewState.status === 'idle' || viewState.status === 'loading') {
    return (
      <Paper variant="outlined" sx={{ p: 2 }} aria-busy="true">
        <Skeleton variant="text" width="40%" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="text" height={36} />
        ))}
        <Skeleton variant="rectangular" height={40} width={240} sx={{ mt: 2 }} />
      </Paper>
    );
  }

  if (viewState.status === 'error') {
    return (
      <Alert severity="error">
        Could not load the next lessons: {viewState.error}
      </Alert>
    );
  }

  if (notice) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Alert severity="success" sx={{ mb: 2 }}>
          {notice}
        </Alert>
        <Button onClick={onBookMore}>Book more lessons</Button>
      </Paper>
    );
  }

  const { items, noSlot } = viewState.data;
  const toBook = items.filter((i) => !i.lessonId).length;
  const totalCents = items.reduce((sum, item) => sum + priceOf(item), 0);
  const hasRate = items.length > 0 && items.every((item) => priceOf(item) > 0);

  if (items.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ mb: 2 }}>
          {noSlot
            ? 'No weekly time is set, so there are no lessons to propose.'
            : 'No lessons left to book in this weekly time.'}
        </Typography>
        {noSlot && (
          <Button variant="contained" onClick={onSetWeeklyTime}>
            Set a weekly time
          </Button>
        )}
      </Paper>
    );
  }

  const count = items.length;
  const lessonWord = count === 1 ? 'lesson' : 'lessons';

  let actions: ReactNode;
  if (isHope) {
    actions =
      toBook === 0 ? (
        <Typography color="textSecondary">
          These lessons are all on the calendar.
        </Typography>
      ) : (
        <Button variant="contained" disabled={busy} onClick={onBook}>
          {`Book ${toBook} ${toBook === 1 ? 'lesson' : 'lessons'}`}
        </Button>
      );
  } else if (!hasRate) {
    actions = (
      <Alert severity="warning">
        No lesson rate is set for this student, so there is nothing to charge.
      </Alert>
    );
  } else if (cardLabel) {
    actions = (
      <Button
        variant="contained"
        size="large"
        disabled={busy}
        onClick={() => setConfirming('charge')}
      >
        {`Charge ${money(totalCents)} to ${cardLabel}`}
      </Button>
    );
  } else {
    actions = (
      <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Typography>No card on file.</Typography>
        <Button
          variant="contained"
          size="large"
          disabled={busy}
          onClick={() => setConfirming('invoice')}
        >
          {`Send an invoice for ${money(totalCents)}`}
        </Button>
      </Stack>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Typography variant="h6" component="h2">
        {`Next ${count} ${lessonWord}`}
      </Typography>
      <List dense aria-label="Next lessons">
        {items.map((item) => (
          <ListItem
            key={item.key}
            disableGutters
            sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
          >
            <ListItemText
              sx={{ flex: '1 1 12rem', minWidth: 0 }}
              primary={formatWhen(item.scheduledAt)}
              secondary={item.lessonId ? 'Already on the calendar' : undefined}
            />
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              <Button
                size="small"
                disabled={busy}
                aria-label={`Change ${formatWhen(item.scheduledAt)}`}
                onClick={() => {
                  setMoving(item);
                  setMoveTo(item.scheduledAt);
                }}
              >
                Change
              </Button>
            </Box>
          </ListItem>
        ))}
      </List>
      {!isHope && hasRate && (
        <Typography sx={{ mb: 2 }}>{`Total ${money(totalCents)}`}</Typography>
      )}
      {actions}

      <Dialog open={moving !== null} onClose={() => setMoving(null)}>
        <DialogTitle>Change this lesson</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateTimePicker
                label="Date & time"
                value={moveTo}
                onChange={(value) => setMoveTo(value)}
              />
            </LocalizationProvider>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoving(null)}>Back</Button>
          <Button
            variant="contained"
            disabled={!moveTo || Number.isNaN(moveTo.getTime())}
            onClick={() => {
              if (moving && moveTo) onMove(moving, moveTo);
              setMoving(null);
            }}
          >
            Change
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirming !== null} onClose={() => setConfirming(null)}>
        <DialogTitle>
          {confirming === 'charge'
            ? `Charge ${money(totalCents)} to ${cardLabel}?`
            : `Send an invoice for ${money(totalCents)}?`}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirming === 'charge'
              ? `For the lessons on ${dateList(items)}.`
              : `Square emails the family an invoice for the lessons on ${dateList(items)}.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)}>Back</Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => {
              const action = confirming;
              setConfirming(null);
              if (action === 'charge') onCharge();
              if (action === 'invoice') onInvoice();
            }}
          >
            {confirming === 'charge' ? `Charge ${money(totalCents)}` : 'Send invoice'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
