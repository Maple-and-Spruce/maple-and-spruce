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
import { useMemo, useState, type ReactNode } from 'react';
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
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Paper,
  Skeleton,
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
  ManualInvoicePaymentSource,
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
  unpaidTaughtLessons,
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

/**
 * Which part of the billing conversation the card is having.
 *
 * Katie does two different jobs with this card, at different times: settling
 * lessons already taught, and lining up (and maybe prepaying) the next ones.
 * The student page shows them as two cards in the order she does them, so each
 * reads as one task rather than a mode to switch into.
 *
 *  - `owed`: only teaching already given and not paid for, picked by hand.
 *  - `upcoming`: only the next lessons, "the next four" or picked by hand.
 *  - `all`: both in one card, the original shape.
 */
export type CommitLessonsScope = 'all' | 'owed' | 'upcoming';

/** Lessons the family has already paid for outside Square. */
export interface CommitLessonsRecordPaidInput extends CommitLessonsInvoiceInput {
  paidWith: ManualInvoicePaymentSource;
}

type ConfirmMode = 'charge' | 'invoice' | 'record';

export interface CommitLessonsCardProps {
  student: Student;
  /** Defaults to `all`. */
  scope?: CommitLessonsScope;
  /**
   * Drop the outlined surface and the heading, for use inside a dialog that
   * supplies its own title (the students table's row actions).
   */
  embedded?: boolean;
  /**
   * The lessons, charges or invoices are still loading. Until they land the
   * card cannot tell "nothing owed" from "not known yet", so it shows a
   * skeleton rather than claiming everything is paid for.
   */
  isLoading?: boolean;
  /** Extra control in the heading, such as "Add lessons". */
  headerAction?: ReactNode;
  /**
   * What to offer when there are no upcoming lessons at all, such as "Set a
   * weekly time". Without lessons there is nothing to line up or pay for, so
   * the card becomes the way to create them instead of a warning and two
   * disabled buttons.
   */
  emptyActions?: ReactNode;
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
  /**
   * Open with these lessons already ticked, for arriving from somewhere that
   * already knows which lesson it means — the attention row for an unpaid
   * taught lesson, say (#128). The card starts in manual mode when this is set,
   * because a pre-tick the picker is not showing is a lie about what will be
   * charged.
   */
  preselectLessonIds?: string[];
  onCharge: (input: CommitLessonsChargeInput) => void;
  onSendInvoice: (input: CommitLessonsInvoiceInput) => void;
  /**
   * The family paid in cash, by check or by Venmo. Records the lessons as
   * paid with no charge and no invoice email. Omit to hide the option.
   */
  onRecordPaid?: (input: CommitLessonsRecordPaidInput) => void;
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
  onRecordPaid,
}: {
  hasCard: boolean;
  amountCents?: number;
  disabled: boolean;
  onCharge: () => void;
  onInvoice: () => void;
  onRecordPaid?: () => void;
}) {
  const priced = (verb: string, fallback: string) =>
    amountCents === undefined ? fallback : `${verb} ${money(amountCents)}`;

  // Money already in hand is its own answer, whichever way the card leans:
  // there is nothing to charge and nobody to invoice.
  const alreadyPaid = onRecordPaid && (
    <Button disabled={disabled} onClick={onRecordPaid}>
      Paid in cash or Venmo
    </Button>
  );

  if (!hasCard) {
    return (
      <>
        <Button variant="contained" disabled={disabled} onClick={onInvoice}>
          {priced('Send an invoice for', 'Send an invoice')}
        </Button>
        {alreadyPaid}
      </>
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
      {alreadyPaid}
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
  owed,
  picked,
  priceFor,
  onToggle,
}: {
  available: Lesson[];
  /** Teaching already given that nobody has paid for (#128). */
  owed: Lesson[];
  picked: string[];
  priceFor: (lesson: Pick<Lesson, 'durationMinutes'>) => number;
  onToggle: (id: string) => void;
}) {
  const row = (lesson: Lesson) => (
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
  );

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Choose the lessons
      </Typography>

      {/*
        Teaching already given comes first, and only when there is any. It is
        the thing most likely to be forgotten — an upcoming lesson will come
        round again, an unpaid one from three weeks ago will not — and putting
        it below a list of twenty future dates is how it stays unpaid (#128).
        The heading says what these are rather than just "past", because the
        distinction that matters is that the studio is owed for them.
      */}
      {owed.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="overline" color="text.secondary">
            Already taught, not paid for
          </Typography>
          <Stack>{owed.slice(0, 20).map(row)}</Stack>
        </Box>
      )}

      <Stack>
        {owed.length > 0 && available.length > 0 && (
          <Typography variant="overline" color="text.secondary">
            Upcoming
          </Typography>
        )}
        {available.length === 0 && owed.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No lessons are waiting to be paid for.
          </Typography>
        )}
        {available.slice(0, 20).map(row)}
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
  prepaying,
  paidWith,
  onPaidWithChange,
  onBack,
  onConfirm,
}: {
  mode: ConfirmMode | null;
  paidWith: ManualInvoicePaymentSource;
  onPaidWithChange: (source: ManualInvoicePaymentSource) => void;
  /**
   * Any lesson in the plan is still to come. Settling teaching already given
   * is not "paying ahead", and saying so would misdescribe the charge.
   */
  prepaying: boolean;
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
  const recording = mode === 'record';

  let title = `Send an invoice for ${total}?`;
  let lead = `${studentName} is asked to pay for ${lessonWord}, one line each:`;
  let confirmLabel = `Send ${total}`;
  if (charging) {
    title = `Charge ${total} now?`;
    lead = `This charges ${studentName}’s card on file straight away, for ${lessonWord}:`;
    confirmLabel = `Charge ${total}`;
  } else if (recording) {
    title = `Record ${total} as paid?`;
    lead = `${studentName} already paid for ${lessonWord}, outside Square:`;
    confirmLabel = `Record ${total} paid`;
  }

  return (
    <Dialog open={mode !== null} onClose={onBack} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {lead}
        </Typography>
        <Stack spacing={0.25} sx={{ mb: 2 }}>
          {plan?.lessons.map((lesson) => (
            <Typography key={lesson.id} variant="body2" color="text.secondary">
              {lessonDate(lesson.scheduledAt)}
              {charging ? '' : ` · ${money(priceFor(lesson))}`}
            </Typography>
          ))}
        </Stack>
        {recording && (
          <Box sx={{ mb: 2 }}>
            <FormLabel id="paid-with-label">How they paid</FormLabel>
            <RadioGroup
              row
              aria-labelledby="paid-with-label"
              value={paidWith}
              onChange={(e) =>
                onPaidWithChange(e.target.value as ManualInvoicePaymentSource)
              }
            >
              <FormControlLabel
                value="admin-manual"
                control={<Radio size="small" />}
                label="Cash or check"
              />
              <FormControlLabel
                value="venmo-manual"
                control={<Radio size="small" />}
                label="Venmo"
              />
            </RadioGroup>
          </Box>
        )}
        {recording ? (
          <Alert severity="info">
            Nothing is charged and no invoice is emailed. These lessons are
            marked paid, so they will not be charged later either.
          </Alert>
        ) : charging ? (
          <Alert severity="warning">
            {prepaying
              ? 'Paying ahead is a commitment on both sides. There is no refund from here. '
              : 'There is no refund from here. '}
            If the studio decides to give something back, credit it by hand in
            Square.
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
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const SCOPE_COPY: Record<
  CommitLessonsScope,
  { title: string; intro: string }
> = {
  all: {
    title: 'Commit and charge',
    intro:
      'Agree a block of lessons with the family, fix any dates that do not ' +
      'work, and take the money. Lessons paid for here are not charged again ' +
      'automatically.',
  },
  owed: {
    title: 'Charge for past lessons',
    intro:
      'Lessons already taught that nobody has paid for yet. Tick the ones to ' +
      'settle and charge the card or send an invoice.',
  },
  upcoming: {
    title: 'Next lessons',
    intro:
      'Line up the next lessons and fix any dates that do not work. Taking ' +
      'payment now is optional; lessons paid for here are not charged again ' +
      'automatically.',
  },
};

export function CommitLessonsCard({
  student,
  scope = 'all',
  embedded = false,
  isLoading = false,
  headerAction,
  emptyActions,
  lessons,
  charges,
  invoices = [],
  rateByLength,
  isCharging = false,
  isInvoicing = false,
  error = null,
  now,
  preselectLessonIds,
  onCharge,
  onSendInvoice,
  onRecordPaid,
  onMoveLesson,
  onSkipLesson,
}: CommitLessonsCardProps) {
  const [count, setCount] = useState(DEFAULT_PREPAY_LESSON_COUNT);
  // Past lessons are always chosen one by one: "the next four" means nothing
  // looking backwards, and a debt should never be collected by a shortcut.
  const [picking, setPicking] = useState(
    () => scope === 'owed' || (preselectLessonIds?.length ?? 0) > 0
  );
  const [picked, setPicked] = useState<string[]>(
    () => preselectLessonIds ?? []
  );
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<ConfirmMode | null>(null);
  const [paidWith, setPaidWith] =
    useState<ManualInvoicePaymentSource>('admin-manual');

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
    () =>
      scope === 'owed'
        ? []
        : prepayableLessons(lessons, charges, reference, alreadyInvoiced),
    [scope, lessons, charges, reference, alreadyInvoiced]
  );

  /**
   * Teaching already given that nobody has paid for (#128).
   *
   * Only reachable by ticking it: `planPrepayment` keeps the count-based
   * shortcut upcoming-only, so "the next four" can never quietly collect a
   * debt. Which means the card has to *offer* these, or they stay invisible.
   */
  const owed = useMemo(
    () =>
      scope === 'upcoming'
        ? []
        : unpaidTaughtLessons(lessons, charges, reference, alreadyInvoiced),
    [scope, lessons, charges, reference, alreadyInvoiced]
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

  // A tick carried in from elsewhere (the attention row) can name a lesson this
  // scope does not show. Charging what is not on screen is the one thing this
  // card must never do, so only the visible ticks count.
  const visibleIds = new Set([...owed, ...available].map((l) => l.id));
  const plan =
    outcome.ok && outcome.plan.lessons.every((l) => visibleIds.has(l.id))
      ? outcome.plan
      : null;
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

  const recordPaid = () => {
    if (!plan || !onRecordPaid) return;
    onRecordPaid({
      lessons: plan.lessons,
      amountCents: plan.amountCents,
      note: note.trim() || undefined,
      paidWith,
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

  const confirmActions: Record<ConfirmMode, () => void> = {
    charge,
    invoice: send,
    record: recordPaid,
  };

  const copy = SCOPE_COPY[scope];

  const heading = embedded ? null : (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <PaidIcon fontSize="small" color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {copy.title}
        </Typography>
        {headerAction}
      </Stack>
    </>
  );

  const surface = (children: ReactNode) =>
    embedded ? (
      <Box>{children}</Box>
    ) : (
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        {children}
      </Paper>
    );

  if (isLoading) {
    return surface(
      <>
        {heading}
        <Stack spacing={1} aria-busy="true" aria-label={`Loading ${copy.title}`}>
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="45%" />
          <Skeleton variant="rectangular" height={36} width={220} />
        </Stack>
      </>
    );
  }

  // Nothing owed is the good outcome, and it deserves one quiet line rather
  // than a picker with nothing in it and two disabled buttons.
  if (scope === 'owed' && owed.length === 0) {
    return surface(
      <>
        {heading}
        <Typography variant="body2" color="text.secondary">
          Every lesson taught so far is paid for or on an invoice.
        </Typography>
      </>
    );
  }

  if (scope === 'upcoming' && available.length === 0) {
    return surface(
      <>
        {heading}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No upcoming lessons yet. Set a weekly time and the next 4 go on the
          calendar, or add lessons one at a time.
        </Typography>
        {emptyActions && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {emptyActions}
          </Stack>
        )}
      </>
    );
  }

  return surface(
    <>
      {heading}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {copy.intro}
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

        {/*
          In count mode the picker is hidden, so an unpaid lesson from three
          weeks ago is invisible — and the count shortcut deliberately will not
          include it. Without this line the feature only helps someone who
          already knew to go looking (#128). It offers the switch rather than
          forcing it: an old lesson may be being settled some other way, and
          hijacking the fast path every time would train Katie to ignore it.
        */}
        {!picking && owed.length > 0 && (
          <Alert
            severity="info"
            action={
              <Button
                size="small"
                onClick={() => {
                  setPicking(true);
                  setPicked(owed.map((l) => l.id));
                }}
              >
                Pick them
              </Button>
            }
          >
            {owed.length === 1
              ? '1 lesson has been taught and not paid for.'
              : `${owed.length} lessons have been taught and not paid for.`}
          </Alert>
        )}

        {picking && (
          <LessonPicker
            available={available}
            owed={owed}
            picked={picked}
            priceFor={rateResolver}
            onToggle={toggle}
          />
        )}

        {scope === 'owed' && owed.length > 1 && (
          <Box>
            <Button
              size="small"
              onClick={() =>
                setPicked(
                  picked.length === owed.length ? [] : owed.map((l) => l.id)
                )
              }
            >
              {picked.length === owed.length
                ? 'Untick all'
                : `Tick all ${owed.length}`}
            </Button>
          </Box>
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
            onRecordPaid={onRecordPaid ? () => setConfirming('record') : undefined}
          />
          {scope !== 'owed' && (
            <Button
              size="small"
              onClick={() => {
                setPicking((v) => !v);
                setPicked([]);
              }}
            >
              {picking ? 'Use the next lessons' : 'Choose lessons instead'}
            </Button>
          )}
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
            No card is on file, so this can only be invoiced. To charge a card
            instead, save it in the Square app and link it under Payment method.
          </Typography>
        )}
      </Stack>

      <ConfirmDialog
        mode={confirming}
        plan={plan}
        studentName={student.name}
        priceFor={rateResolver}
        busy={busy}
        prepaying={Boolean(
          plan?.lessons.some((l) => !owed.some((o) => o.id === l.id))
        )}
        onBack={() => setConfirming(null)}
        paidWith={paidWith}
        onPaidWithChange={setPaidWith}
        onConfirm={confirming ? confirmActions[confirming] : send}
      />
    </>
  );
}
