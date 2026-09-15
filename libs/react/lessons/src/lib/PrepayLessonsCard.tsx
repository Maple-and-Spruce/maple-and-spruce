'use client';

/**
 * PrepayLessonsCard (#864) — take money for a block of lessons at the desk.
 *
 * Autopay handles the steady state. This is for the other conversation: a
 * family agrees to pay for the next few lessons now, and in exchange the slot
 * is a commitment on both sides. That happens in person, so the charge has to
 * be one button away while the family is standing there.
 *
 * THREE THINGS THIS SCREEN OWES THE PERSON PRESSING THE BUTTON
 * ------------------------------------------------------------
 *   1. **Which lessons.** Every covered date is listed before anything is
 *      taken, because "the next four lessons" means nothing to a family unless
 *      the dates match what they think they agreed to.
 *   2. **That it is final.** Prepaid means committed; there is no refund path,
 *      and the confirmation says so rather than leaving it implied.
 *   3. **That the amount is the one shown.** The total travels with the
 *      request and the server refuses the charge if it prices the lessons
 *      differently — so a rate change mid-conversation stops the charge instead
 *      of quietly altering it.
 *
 * Presentational; the page owns the data and the mutation. The selection runs
 * through `planPrepayment`, the same pure function the Cloud Function uses, so
 * the preview and the charge cannot drift apart.
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PaidIcon from '@mui/icons-material/Paid';
import type {
  Lesson,
  LessonRateByLength,
  LessonScheduledCharge,
  Student,
} from '@maple/ts/domain';
import {
  DEFAULT_PREPAY_LESSON_COUNT,
  PREPAY_LESSON_COUNTS,
  describePrepaymentProblem,
  planPrepayment,
  prepayableLessons,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';

export interface PrepayLessonsChargeInput {
  lessonIds: string[];
  amountCents: number;
  note?: string;
}

export interface PrepayLessonsCardProps {
  student: Student;
  lessons: Lesson[];
  charges: LessonScheduledCharge[];
  rateByLength: LessonRateByLength;
  isCharging?: boolean;
  error?: string | null;
  /** Reference point for "upcoming"; injectable so stories are deterministic. */
  now?: Date;
  onCharge: (input: PrepayLessonsChargeInput) => void;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function lessonDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function PrepayLessonsCard({
  student,
  lessons,
  charges,
  rateByLength,
  isCharging = false,
  error = null,
  now,
  onCharge,
}: PrepayLessonsCardProps) {
  const [count, setCount] = useState(DEFAULT_PREPAY_LESSON_COUNT);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  const reference = useMemo(() => now ?? new Date(), [now]);

  const rateResolver = useMemo(
    () => (lesson: Pick<Lesson, 'durationMinutes'>) =>
      resolvePrivatePayLessonRateCents(lesson, student, rateByLength),
    [student, rateByLength]
  );

  const available = useMemo(
    () => prepayableLessons(lessons, charges, reference),
    [lessons, charges, reference]
  );

  const outcome = useMemo(
    () =>
      planPrepayment(
        student.id,
        lessons,
        charges,
        picking ? { lessonIds: picked } : { lessonCount: count },
        rateResolver,
        reference
      ),
    [student.id, lessons, charges, picking, picked, count, rateResolver, reference]
  );

  // Hope families bill through the EMA portal, so there is nothing here for
  // them and offering it would only invite a mistake.
  if (student.isHopeScholarship) return null;

  const hasCard = Boolean(student.squareCardId && student.squareCustomerId);

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
    );

  const plan = outcome.ok ? outcome.plan : null;
  // Picking nothing yet is not an error worth shouting about — it is just the
  // starting state of the manual picker.
  const problem =
    !outcome.ok && !(picking && picked.length === 0) ? outcome.problem : null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <PaidIcon fontSize="small" color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Pay ahead
        </Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Charge the card on file now for a block of lessons. Lessons paid for
        this way are not charged again automatically.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!hasCard && (
        <Alert severity="info" sx={{ mb: 2 }}>
          There is no card on file yet. Save the card in the Square app, then
          link it above.
        </Alert>
      )}

      <Stack spacing={2}>
        {!picking && (
          <TextField
            select
            size="small"
            label="Lessons to cover"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            sx={{ maxWidth: 220 }}
          >
            {PREPAY_LESSON_COUNTS.map((n) => (
              <MenuItem key={n} value={n}>
                Next {n} lesson{n === 1 ? '' : 's'}
              </MenuItem>
            ))}
          </TextField>
        )}

        {picking && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Choose the lessons
            </Typography>
            <Stack>
              {available.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No upcoming lessons are waiting to be paid for.
                </Typography>
              )}
              {available.slice(0, 20).map((lesson) => (
                <FormControlLabel
                  key={lesson.id}
                  control={
                    <Checkbox
                      size="small"
                      checked={picked.includes(lesson.id)}
                      onChange={() => toggle(lesson.id)}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {lessonDate(lesson.scheduledAt)} ·{' '}
                      {money(rateResolver(lesson))}
                    </Typography>
                  }
                />
              ))}
            </Stack>
          </Box>
        )}

        {!picking && plan && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              This covers
            </Typography>
            <Stack spacing={0.25}>
              {plan.lessons.map((lesson) => (
                <Typography
                  key={lesson.id}
                  variant="body2"
                  color="text.secondary"
                >
                  {lessonDate(lesson.scheduledAt)}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}

        {problem && (
          <Alert severity="warning">
            {describePrepaymentProblem(problem)}
          </Alert>
        )}

        <TextField
          size="small"
          label="Note (optional)"
          placeholder="Spring block, agreed at the lesson"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Button
            variant="contained"
            disabled={!plan || !hasCard || isCharging}
            onClick={() => setConfirming(true)}
          >
            {plan ? `Charge ${money(plan.amountCents)} now` : 'Charge now'}
          </Button>
          <Button
            size="small"
            onClick={() => {
              setPicking((v) => !v);
              setPicked([]);
            }}
          >
            {picking ? 'Use the next lessons' : 'Choose lessons instead'}
          </Button>
          {plan && (
            <Chip
              size="small"
              variant="outlined"
              label={`${plan.lessons.length} lesson${
                plan.lessons.length === 1 ? '' : 's'
              }`}
            />
          )}
        </Stack>
      </Stack>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Charge {plan ? money(plan.amountCents) : ''} now?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This charges {student.name}&rsquo;s card on file straight away, for{' '}
            {plan?.lessons.length} lesson
            {plan?.lessons.length === 1 ? '' : 's'}:
          </Typography>
          <Stack spacing={0.25} sx={{ mb: 2 }}>
            {plan?.lessons.map((lesson) => (
              <Typography key={lesson.id} variant="body2" color="text.secondary">
                {lessonDate(lesson.scheduledAt)}
              </Typography>
            ))}
          </Stack>
          <Alert severity="warning">
            Paying ahead is a commitment on both sides. There is no refund from
            here. If the studio decides to give something back, credit it by
            hand in Square.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Back</Button>
          <Button
            variant="contained"
            disabled={!plan || isCharging}
            onClick={() => {
              if (!plan) return;
              onCharge({
                lessonIds: plan.lessons.map((l) => l.id),
                amountCents: plan.amountCents,
                note: note.trim() || undefined,
              });
              setConfirming(false);
            }}
          >
            Charge {plan ? money(plan.amountCents) : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
