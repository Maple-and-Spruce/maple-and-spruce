'use client';

/**
 * CommitLessonsCard (#113) — the end-of-lesson billing conversation, in one card.
 *
 * Katie finishes a lesson, talks the coming weeks through with the family, they
 * agree to a block, she nudges a date around a holiday, and she takes the
 * money — all while they are standing there. This used to be three screens:
 * Pay ahead for the block, the Lessons table to move or skip a week, and the
 * invoice builder when there was no card on file. Each hop lost the context of
 * the last, and the third one was a dead end.
 *
 * WHAT THIS SCREEN OWES THE PERSON PRESSING THE BUTTON
 * ----------------------------------------------------
 *   1. **Which lessons.** Every covered date is listed before anything is
 *      taken, because "the next four lessons" means nothing to a family unless
 *      the dates match what they think they agreed to.
 *   2. **A way to fix a date there and then.** Move or skip, in place. Skipping
 *      pulls the next date into the block, so a commitment to four lessons
 *      stays four lessons rather than quietly becoming three.
 *   3. **That a charge is final.** Prepaid means committed; there is no refund
 *      path, and the confirmation says so rather than leaving it implied.
 *   4. **That the amount is the one shown.** The total travels with the request
 *      and the server refuses the charge if it prices the lessons differently,
 *      so a rate change mid-conversation stops the charge instead of quietly
 *      altering it.
 *
 * THE UNIT IS THE LESSON, NOT THE WEEK
 * ------------------------------------
 * Katie says "commit to four weeks", and for a weekly student that is what this
 * is. The count stays in lessons because that is what is priced and what
 * `planPrepayment` takes, and because for a biweekly student "4 weeks" meaning
 * two lessons is more confusing than "4 lessons, Oct 5 – Nov 23". The span
 * carries the weeks.
 *
 * Presentational; the page owns the data and every mutation. The selection runs
 * through `planPrepayment`, the same pure function the Cloud Function uses, so
 * the preview and the charge cannot drift apart — and the invoice lines come
 * from `lessonInvoiceLines`, so a block invoice is priced by the same resolver
 * as the card charge.
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
  Tooltip,
  Typography,
} from '@mui/material';
import PaidIcon from '@mui/icons-material/Paid';
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import type {
  Invoice,
  Lesson,
  LessonRateByLength,
  LessonScheduledCharge,
  Student,
} from '@maple/ts/domain';
import type { PrepaymentPlan } from '@maple/ts/domain';
import {
  DEFAULT_PREPAY_LESSON_COUNT,
  PREPAY_LESSON_COUNTS,
  describePrepaymentProblem,
  invoicedLessonIds,
  planPrepayment,
  prepayableLessons,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';

export interface CommitLessonsChargeInput {
  lessonIds: string[];
  amountCents: number;
  note?: string;
}

export interface CommitLessonsInvoiceInput {
  lessons: Array<Pick<Lesson, 'id' | 'scheduledAt' | 'durationMinutes'>>;
  amountCents: number;
  note?: string;
}

export interface CommitLessonsCardProps {
  student: Student;
  lessons: Lesson[];
  charges: LessonScheduledCharge[];
  /**
   * The student's invoices. A lesson already on one is not offered again — the
   * server refuses such a charge anyway (#101), and offering it only produces a
   * dead end with a message about a charge that does not exist (#110).
   */
  invoices?: Invoice[];
  rateByLength: LessonRateByLength;
  isCharging?: boolean;
  isInvoicing?: boolean;
  error?: string | null;
  /** Reference point for "upcoming"; injectable so stories are deterministic. */
  now?: Date;
  onCharge: (input: CommitLessonsChargeInput) => void;
  onSendInvoice: (input: CommitLessonsInvoiceInput) => void;
  /** Open the page's lesson editor on one date in the block. */
  onMoveLesson?: (lesson: Lesson) => void;
  /** Cancel one date; the block pulls the next one in behind it. */
  onSkipLesson?: (lesson: Lesson) => void;
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

/** `Oct 5 – Nov 23`, the weeks Katie just talked through, read back. */
function spanLabel(dates: Date[]): string | null {
  if (dates.length === 0) return null;
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
    }).format(d);
  const first = day(dates[0]);
  const last = day(dates[dates.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

/**
 * One date in the committed block, with the two ways to fix it.
 *
 * Its own component so the card's body reads as the block rather than as row
 * chrome, and so each label carries the date — a screen reader hearing "Move"
 * eleven times cannot tell which week it is about to move.
 */
function CommittedDate({
  lesson,
  busy,
  onMove,
  onSkip,
}: {
  lesson: Lesson;
  busy: boolean;
  onMove?: (lesson: Lesson) => void;
  onSkip?: (lesson: Lesson) => void;
}) {
  const when = lessonDate(lesson.scheduledAt);
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
        {when}
      </Typography>
      {onMove && (
        <Tooltip title="Move this lesson">
          <Button
            size="small"
            color="inherit"
            disabled={busy}
            startIcon={<EditCalendarIcon fontSize="small" />}
            onClick={() => onMove(lesson)}
            aria-label={`Move the lesson on ${when}`}
          >
            Move
          </Button>
        </Tooltip>
      )}
      {onSkip && (
        <Tooltip title="Skip this week; the next date joins the block">
          <Button
            size="small"
            color="inherit"
            disabled={busy}
            startIcon={<EventBusyIcon fontSize="small" />}
            onClick={() => onSkip(lesson)}
            aria-label={`Skip the lesson on ${when}`}
          >
            Skip
          </Button>
        </Tooltip>
      )}
    </Stack>
  );
}

/**
 * The two ways to be paid, and which one leads.
 *
 * With a card on file the charge leads and the invoice is the alternative for a
 * family who would rather pay another way. With no card the invoice is the only
 * way through, so it becomes the primary button rather than a message
 * explaining why nothing can be done — that dead end is what used to send Katie
 * off to the invoice builder with the conversation left behind.
 */
function PaymentActions({
  hasCard,
  amountCents,
  disabled,
  onCharge,
  onInvoice,
}: {
  hasCard: boolean;
  amountCents?: number;
  disabled: boolean;
  onCharge: () => void;
  onInvoice: () => void;
}) {
  const priced = (verb: string, fallback: string) =>
    amountCents === undefined ? fallback : `${verb} ${money(amountCents)}`;

  if (!hasCard) {
    return (
      <Button variant="contained" disabled={disabled} onClick={onInvoice}>
        {priced('Send an invoice for', 'Send an invoice')}
      </Button>
    );
  }

  return (
    <>
      <Button variant="contained" disabled={disabled} onClick={onCharge}>
        {amountCents === undefined
          ? 'Charge the card'
          : `Charge ${money(amountCents)} to the card`}
      </Button>
      <Button disabled={disabled} onClick={onInvoice}>
        Send an invoice instead
      </Button>
    </>
  );
}

/**
 * Choosing the lessons by hand, for a family paying for one specific stretch
 * rather than "the next four".
 *
 * Capped at twenty rows: past that this is the wrong tool and the Lessons table
 * is the right one, and an unbounded list of checkboxes inside a card is not a
 * decision anybody makes well.
 */
function LessonPicker({
  available,
  picked,
  priceFor,
  onToggle,
}: {
  available: Lesson[];
  picked: string[];
  priceFor: (lesson: Pick<Lesson, 'durationMinutes'>) => number;
  onToggle: (id: string) => void;
}) {
  return (
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
                onChange={() => onToggle(lesson.id)}
              />
            }
            label={
              <Typography variant="body2">
                {lessonDate(lesson.scheduledAt)} · {money(priceFor(lesson))}
              </Typography>
            }
          />
        ))}
      </Stack>
    </Box>
  );
}

/**
 * The confirmation, for whichever way the money is being asked for.
 *
 * One component for both because the obligations are the same: name every date
 * before anything happens, and state the consequence — that a charge cannot be
 * undone, or that an invoice means these lessons will not also be carded. The
 * two differ only in wording, and splitting them invited the wording to drift.
 */
function ConfirmDialog({
  mode,
  plan,
  studentName,
  priceFor,
  busy,
  onBack,
  onConfirm,
}: {
  mode: 'charge' | 'invoice' | null;
  plan: PrepaymentPlan | null;
  studentName: string;
  priceFor: (lesson: Pick<Lesson, 'durationMinutes'>) => number;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const total = plan ? money(plan.amountCents) : '';
  const count = plan?.lessons.length ?? 0;
  const lessonWord = `${count} lesson${count === 1 ? '' : 's'}`;
  const charging = mode === 'charge';

  return (
    <Dialog open={mode !== null} onClose={onBack} fullWidth maxWidth="sm">
      <DialogTitle>
        {charging ? `Charge ${total} now?` : `Send an invoice for ${total}?`}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {charging
            ? `This charges ${studentName}’s card on file straight away, for ${lessonWord}:`
            : `${studentName} is asked to pay for ${lessonWord}, one line each:`}
        </Typography>
        <Stack spacing={0.25} sx={{ mb: 2 }}>
          {plan?.lessons.map((lesson) => (
            <Typography key={lesson.id} variant="body2" color="text.secondary">
              {lessonDate(lesson.scheduledAt)}
              {charging ? '' : ` · ${money(priceFor(lesson))}`}
            </Typography>
          ))}
        </Stack>
        {charging ? (
          <Alert severity="warning">
            Paying ahead is a commitment on both sides. There is no refund from
            here. If the studio decides to give something back, credit it by hand
            in Square.
          </Alert>
        ) : (
          <Alert severity="info">
            The invoice is sent straight away so the family can pay it. These
            lessons will not be charged to a card as well, here or by the nightly
            job.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onBack}>Back</Button>
        <Button variant="contained" disabled={!plan || busy} onClick={onConfirm}>
          {charging ? `Charge ${total}` : `Send ${total}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CommitLessonsCard({
  student,
  lessons,
  charges,
  invoices = [],
  rateByLength,
  isCharging = false,
  isInvoicing = false,
  error = null,
  now,
  onCharge,
  onSendInvoice,
  onMoveLesson,
  onSkipLesson,
}: CommitLessonsCardProps) {
  const [count, setCount] = useState(DEFAULT_PREPAY_LESSON_COUNT);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<'charge' | 'invoice' | null>(null);

  const reference = useMemo(() => now ?? new Date(), [now]);

  const rateResolver = useMemo(
    () => (lesson: Pick<Lesson, 'durationMinutes'>) =>
      resolvePrivatePayLessonRateCents(lesson, student, rateByLength),
    [student, rateByLength]
  );

  const alreadyInvoiced = useMemo(
    () => invoicedLessonIds(invoices),
    [invoices]
  );

  const available = useMemo(
    () => prepayableLessons(lessons, charges, reference, alreadyInvoiced),
    [lessons, charges, reference, alreadyInvoiced]
  );

  const outcome = useMemo(
    () =>
      planPrepayment(
        student.id,
        lessons,
        charges,
        picking ? { lessonIds: picked } : { lessonCount: count },
        rateResolver,
        reference,
        alreadyInvoiced
      ),
    [
      student.id,
      lessons,
      charges,
      picking,
      picked,
      count,
      rateResolver,
      reference,
      alreadyInvoiced,
    ]
  );

  // Hope families bill through the EMA portal, so there is nothing here for
  // them and offering it would only invite a mistake.
  if (student.isHopeScholarship) return null;

  const hasCard = Boolean(student.squareCardId && student.squareCustomerId);
  const busy = isCharging || isInvoicing;

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  const plan = outcome.ok ? outcome.plan : null;
  // `nothing-picked` is the starting state of the manual picker, not a mistake
  // worth shouting about — but it *is* the reason there is no plan, so the
  // buttons stay disabled rather than offering to charge the next four with
  // nothing ticked (#106).
  const problem =
    !outcome.ok && outcome.problem !== 'nothing-picked' ? outcome.problem : null;

  /** The full lesson rows behind the plan, so move/skip have something to act on. */
  const planRows: Lesson[] = plan
    ? plan.lessons
        .map((l) => lessons.find((full) => full.id === l.id))
        .filter((l): l is Lesson => l !== undefined)
    : [];

  const span = plan ? spanLabel(plan.lessons.map((l) => l.scheduledAt)) : null;

  const send = () => {
    if (!plan) return;
    onSendInvoice({
      lessons: plan.lessons,
      amountCents: plan.amountCents,
      note: note.trim() || undefined,
    });
    setConfirming(null);
  };

  const charge = () => {
    if (!plan) return;
    onCharge({
      lessonIds: plan.lessons.map((l) => l.id),
      amountCents: plan.amountCents,
      note: note.trim() || undefined,
    });
    setConfirming(null);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <PaidIcon fontSize="small" color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Commit and charge
        </Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Agree a block of lessons with the family, fix any dates that do not
        work, and take the money. Lessons paid for here are not charged again
        automatically.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        {!picking && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              select
              size="small"
              label="Commit to"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              sx={{ minWidth: 200 }}
            >
              {PREPAY_LESSON_COUNTS.map((n) => (
                <MenuItem key={n} value={n}>
                  The next {n} lesson{n === 1 ? '' : 's'}
                </MenuItem>
              ))}
            </TextField>
            {span && <Chip size="small" variant="outlined" label={span} />}
          </Stack>
        )}

        {picking && (
          <LessonPicker
            available={available}
            picked={picked}
            priceFor={rateResolver}
            onToggle={toggle}
          />
        )}

        {!picking && plan && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              This covers
            </Typography>
            <Stack spacing={0.25}>
              {planRows.map((lesson) => (
                <CommittedDate
                  key={lesson.id}
                  lesson={lesson}
                  busy={busy}
                  onMove={onMoveLesson}
                  onSkip={onSkipLesson}
                />
              ))}
            </Stack>
          </Box>
        )}

        {problem && (
          <Alert severity="warning">{describePrepaymentProblem(problem)}</Alert>
        )}

        <TextField
          size="small"
          label="Note (optional)"
          placeholder="Spring block, agreed at the lesson"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <PaymentActions
            hasCard={hasCard}
            amountCents={plan?.amountCents}
            disabled={!plan || busy}
            onCharge={() => setConfirming('charge')}
            onInvoice={() => setConfirming('invoice')}
          />
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

        {!hasCard && (
          <Typography variant="body2" color="text.secondary">
            No card is on file, so the block can only be invoiced. To charge a
            card instead, save it in the Square app and link it above.
          </Typography>
        )}
      </Stack>

      <ConfirmDialog
        mode={confirming}
        plan={plan}
        studentName={student.name}
        priceFor={rateResolver}
        busy={busy}
        onBack={() => setConfirming(null)}
        onConfirm={confirming === 'charge' ? charge : send}
      />
    </Paper>
  );
}
