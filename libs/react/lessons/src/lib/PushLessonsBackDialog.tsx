'use client';

/**
 * Confirm pushing a lesson and every later one back a week.
 *
 * Katie is out that day, or the family is away. Every lesson from that one on
 * slides back a week together, so she sees each date that moves before it
 * does. Payments stay with the lessons, which the dialog says, because "will
 * the family be charged again?" is the first thing she will wonder.
 *
 * Presentational: the page plans the moves and does the write.
 */
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { SCHEDULE_TIME_ZONE } from '@maple/ts/domain';

export interface PushLessonsBackMove {
  id: string;
  from: Date;
  to: Date;
  paid?: boolean;
}

export interface PushLessonsBackDialogProps {
  /** Earliest first. Empty closes the dialog. */
  moves: PushLessonsBackMove[];
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
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

function formatDay(at: Date): string {
  return at.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

export function PushLessonsBackDialog({
  moves,
  busy,
  error,
  onConfirm,
  onClose,
}: PushLessonsBackDialogProps) {
  const count = moves.length;
  const title =
    count === 1 ? 'Push this lesson back a week?' : `Push ${count} lessons back a week?`;

  return (
    <Dialog open={count > 0} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <DialogContentText>
          {count === 1
            ? 'It keeps its time and its payment.'
            : 'This lesson and every later one move together. They keep their times and their payments.'}
        </DialogContentText>
        <List dense aria-label="Lessons that move">
          {moves.map((move) => (
            <ListItem key={move.id} disableGutters>
              <ListItemText
                primary={`${formatWhen(move.from)} → ${formatDay(move.to)}`}
              />
              {move.paid && (
                <Chip label="Paid" size="small" color="success" variant="outlined" />
              )}
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Back
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={busy}>
          {count === 1 ? 'Push it back' : `Push ${count} back`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
