'use client';

/**
 * Cancel a lesson, optionally rescheduling it with a credit (#209).
 *
 * Two choices and nothing else. Whether a family gets a credit is Katie's call
 * under the studio policy, so there is no reason to record, no notice period
 * and no count of earlier cancellations — the Activity tab is the history if
 * she wants it.
 *
 * "With a credit" means the new lesson is covered by whatever paid for this
 * one. The dialog says which, because it decides whether the family will be
 * asked for money for the new date.
 *
 * The **weather** variant (#210) is the studio cancelling, so it offers what
 * the policy does: reschedule with a credit (always, since the studio is not
 * charging for that week), or hold the lesson online instead.
 *
 * Presentational: the page plans the block and does the writes.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { SCHEDULE_TIME_ZONE } from '@maple/ts/domain';
import type { Lesson } from '@maple/ts/domain';

export type CancelLessonChoice = 'cancel' | 'reschedule' | 'virtual';

/** `cancel` is Katie cancelling one lesson; `weather` is the studio closing. */
export type CancelLessonVariant = 'cancel' | 'weather';

/** What booking the new time involves, from `planFillBlock`. */
export interface ReschedulePlan {
  /** Booking it also adds a teaching block; say so. */
  note?: string;
  /** It cannot be booked at all, and why. */
  blocked?: string;
}

export interface CancelLessonDialogProps {
  /** The lesson being cancelled; the dialog is open while this is set. */
  lesson: Lesson | null;
  variant?: CancelLessonVariant;
  /** Which choice to start on. A cancelled lesson can only be rescheduled. */
  initialChoice?: CancelLessonChoice;
  /** Whether a payment already covers this lesson, and so the new one. */
  paidFor: boolean;
  /** Plans the block for a candidate new time. */
  planFor: (scheduledAt: Date) => ReschedulePlan;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onCancel: (lesson: Lesson) => void;
  onReschedule: (lesson: Lesson, scheduledAt: Date) => void;
  /** Weather only: hold the lesson online instead. */
  onGoVirtual?: (lesson: Lesson) => void;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function submitLabel(choice: CancelLessonChoice, alreadyCancelled: boolean): string {
  if (choice === 'cancel') return 'Cancel lesson';
  if (choice === 'virtual') return 'Hold it online';
  return alreadyCancelled ? 'Reschedule' : 'Cancel and reschedule';
}

const CHOICES: Record<
  CancelLessonVariant,
  Array<{ value: CancelLessonChoice; label: string }>
> = {
  cancel: [
    { value: 'cancel', label: 'Cancel it' },
    { value: 'reschedule', label: 'Cancel and reschedule with a credit' },
  ],
  weather: [
    { value: 'reschedule', label: 'Reschedule with a credit' },
    { value: 'virtual', label: 'Hold it online' },
  ],
};

function titleFor(
  variant: CancelLessonVariant,
  alreadyCancelled: boolean,
  when: string
): string {
  if (variant === 'weather') return `Weather: ${when}`;
  return alreadyCancelled ? `Reschedule ${when}` : `Cancel ${when}?`;
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

export function CancelLessonDialog({
  lesson,
  variant = 'cancel',
  initialChoice,
  paidFor,
  planFor,
  busy,
  error,
  onClose,
  onCancel,
  onReschedule,
  onGoVirtual,
}: CancelLessonDialogProps) {
  const alreadyCancelled = lesson?.status === 'cancelled';
  const firstChoice = initialChoice ?? CHOICES[variant][0].value;
  const [choice, setChoice] = useState<CancelLessonChoice>(firstChoice);
  const [newTime, setNewTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!lesson) return;
    setChoice(alreadyCancelled ? 'reschedule' : firstChoice);
    // Same time next week: the usual answer, and an easy one to adjust.
    setNewTime(new Date(lesson.scheduledAt.getTime() + WEEK_MS));
  }, [lesson, alreadyCancelled, firstChoice]);

  if (!lesson) return null;

  const when = formatWhen(lesson.scheduledAt);
  const validTime = newTime !== null && !Number.isNaN(newTime.getTime());
  const plan = choice === 'reschedule' && validTime ? planFor(newTime) : {};
  const canSubmit =
    !busy && (choice !== 'reschedule' || (validTime && !plan.blocked));
  const showChoices = !alreadyCancelled;

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {titleFor(variant, alreadyCancelled, when)}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {showChoices && (
          <RadioGroup
            aria-label="What to do"
            value={choice}
            onChange={(e) => setChoice(e.target.value as CancelLessonChoice)}
          >
            {CHOICES[variant].map((option) => (
              <FormControlLabel
                key={option.value}
                value={option.value}
                control={<Radio />}
                label={option.label}
              />
            ))}
          </RadioGroup>
        )}

        {choice === 'virtual' && (
          <Typography color="textSecondary" sx={{ mt: 1 }}>
            It keeps its time and its payment, and the room is freed.
          </Typography>
        )}

        {choice === 'cancel' && (
          <Typography color="textSecondary" sx={{ mt: 1 }}>
            {paidFor
              ? 'It stays on the record as cancelled. The payment for it stays as it is.'
              : 'It stays on the record as cancelled.'}
          </Typography>
        )}

        {choice === 'reschedule' && (
          <Box sx={{ mt: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateTimePicker
                label="New date & time"
                value={newTime}
                onChange={(value) => setNewTime(value)}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
            <Typography color="textSecondary" sx={{ mt: 1.5 }}>
              {paidFor
                ? 'The payment for this lesson covers the new one.'
                : 'Nothing has paid for this lesson yet, so the new one is billed like any other.'}
            </Typography>
            {plan.note && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                {plan.note}
              </Alert>
            )}
            {plan.blocked && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                {plan.blocked}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Back
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => {
            if (choice === 'cancel') onCancel(lesson);
            else if (choice === 'virtual') onGoVirtual?.(lesson);
            else if (newTime) onReschedule(lesson, newTime);
          }}
        >
          {busy ? 'Saving...' : submitLabel(choice, alreadyCancelled)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
