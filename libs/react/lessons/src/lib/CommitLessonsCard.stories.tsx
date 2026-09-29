import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within, screen } from 'storybook/test';
import { CommitLessonsCard } from './CommitLessonsCard';
import type {
  Invoice,
  Lesson,
  LessonScheduledCharge,
  Student,
} from '@maple/ts/domain';

const NOW = new Date('2026-09-10T12:00:00Z');
const DAY = 86_400_000;
const RATE = 4125;

const student: Student = {
  id: 'stu-1',
  name: 'Delphine Cray',
  instrument: 'violin',
  status: 'active',
  registeredLessonLength: '30-min-full',
  primaryContactName: 'Marguerite Cray',
  primaryContactEmail: 'marguerite@example.com',
  squareCustomerId: 'sq-cust-1',
  squareCardId: 'sq-card-1',
  createdAt: NOW,
  updatedAt: NOW,
} as Student;

function lesson(n: number, over: Partial<Lesson> = {}): Lesson {
  return {
    id: `lesson-${n}`,
    studentId: 'stu-1',
    teacherId: 'teacher-1',
    scheduledAt: new Date(NOW.getTime() + n * 7 * DAY),
    durationMinutes: 30,
    status: 'scheduled',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Lesson;
}

/** Sep 17, Sep 24, Oct 1, Oct 8, Oct 15, Oct 22, Oct 29, Nov 5. */
const lessons = Array.from({ length: 8 }, (_, i) => lesson(i + 1));

function invoiceFor(lessonId: string, status: Invoice['status'] = 'sent'): Invoice {
  return {
    id: `inv-${lessonId}`,
    studentId: 'stu-1',
    status,
    lineItems: [
      {
        id: 'line-1',
        description: '30-min lesson',
        lessonId,
        quantity: 1,
        unitAmountCents: RATE,
        subtotalCents: RATE,
      },
    ],
    totalCents: RATE,
    createdAt: NOW,
    updatedAt: NOW,
  } as Invoice;
}

const meta = {
  component: CommitLessonsCard,
  title: 'Lessons/CommitLessonsCard',
  parameters: { layout: 'padded' },
  args: {
    student,
    lessons,
    charges: [],
    invoices: [],
    rateByLength: { '30-min-full': RATE },
    now: NOW,
    isCharging: false,
    isInvoicing: false,
    error: null,
    onCharge: fn(),
    onSendInvoice: fn(),
    onMoveLesson: fn(),
    onSkipLesson: fn(),
  },
} satisfies Meta<typeof CommitLessonsCard>;

export default meta;
type Story = StoryObj<typeof CommitLessonsCard>;

/**
 * The default: four lessons, priced from the studio rate table, with the span
 * read back so "the next four" matches the weeks Katie just talked through.
 */
export const TheNextFourLessons: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /Charge \$165\.00 to the card/ })
    ).toBeEnabled();
    await expect(canvas.getByText('4 lessons')).toBeInTheDocument();
    await expect(canvas.getByText('Sep 17 – Oct 8')).toBeInTheDocument();
  },
};

/**
 * The whole point of the confirmation: the dates are stated, the finality is
 * stated, and only then does the money move — with the amount that was shown.
 */
export const ConfirmsBeforeTakingMoney: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: /Charge \$165\.00 to the card/ })
    );

    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByText(/no refund from here/i)).toBeInTheDocument();

    await userEvent.click(
      dialog.getByRole('button', { name: /^Charge \$165\.00$/ })
    );

    await expect(args.onCharge).toHaveBeenCalledWith({
      lessonIds: ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4'],
      amountCents: 4 * RATE,
      note: undefined,
    });
  },
};

/** Backing out of the confirmation must not take anything. */
export const BackingOutChargesNothing: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: /Charge \$165\.00 to the card/ })
    );
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }));

    await expect(args.onCharge).not.toHaveBeenCalled();
  },
};

/**
 * No card on file is not a dead end any more. The invoice becomes the primary
 * action rather than a message explaining why nothing can be done — sending
 * Katie off to the invoice builder is what this card exists to stop.
 */
export const NoCardMeansInvoiceLeads: Story = {
  args: { student: { ...student, squareCardId: undefined } as Student },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByRole('button', { name: /Charge .* to the card/ })
    ).not.toBeInTheDocument();
    await expect(
      await canvas.findByText(/only be invoiced/i)
    ).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', { name: /Send an invoice for \$165\.00/ })
    );
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: /^Send \$165\.00$/ }));

    await expect(args.onSendInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 4 * RATE, note: undefined })
    );
  },
};

/** The invoice confirmation names every line, because the family will read them. */
export const InvoicingTheBlockListsEveryLine: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Send an invoice instead' })
    );

    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByText(/one line each/i)).toBeInTheDocument();
    await expect(
      dialog.getByText(/will not be charged to a card as well/i)
    ).toBeInTheDocument();

    await userEvent.click(dialog.getByRole('button', { name: /^Send \$165\.00$/ }));

    const call = (args.onSendInvoice as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { lessons: Array<{ id: string }> };
    await expect(call.lessons.map((l) => l.id)).toEqual([
      'lesson-1',
      'lesson-2',
      'lesson-3',
      'lesson-4',
    ]);
  },
};

/** Picking lessons by hand, for a family paying for a specific stretch. */
export const ChoosingLessonsByHand: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Choose lessons instead' })
    );

    const boxes = await canvas.findAllByRole('checkbox');
    await userEvent.click(boxes[1]);
    await userEvent.click(boxes[2]);

    await userEvent.click(
      canvas.getByRole('button', { name: /Charge \$82\.50 to the card/ })
    );
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(
      dialog.getByRole('button', { name: /^Charge \$82\.50$/ })
    );

    await expect(args.onCharge).toHaveBeenCalledWith({
      lessonIds: ['lesson-2', 'lesson-3'],
      amountCents: 2 * RATE,
      note: undefined,
    });
  },
};

/** Lessons already covered by a charge are not offered a second time. */
export const SkipsLessonsAlreadyCharged: Story = {
  args: {
    charges: [
      {
        id: 'chg-stu-1-lesson-1',
        studentId: 'stu-1',
        ruleId: 'manual',
        lessonIds: ['lesson-1', 'lesson-2'],
        amountCents: 2 * RATE,
        dueAt: NOW,
        status: 'paid',
        idempotencyKey: 'lc-0000000000000001',
        createdAt: NOW,
        updatedAt: NOW,
      } satisfies LessonScheduledCharge,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Still four lessons and the same total — just starting two weeks later.
    await expect(
      await canvas.findByRole('button', { name: /Charge \$165\.00 to the card/ })
    ).toBeEnabled();
    await expect(canvas.getByText('Oct 1 – Oct 22')).toBeInTheDocument();
  },
};

/**
 * A lesson already on an invoice is not offered for a card charge either (#110).
 * Without this the card offers dates the server then refuses, and the refusal
 * talks about a charge that does not exist.
 */
export const SkipsLessonsAlreadyInvoiced: Story = {
  args: { invoices: [invoiceFor('lesson-1'), invoiceFor('lesson-2')] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Oct 1 – Oct 22')).toBeInTheDocument();
    await expect(canvas.queryByText(/Sep 17/)).not.toBeInTheDocument();
  },
};

/** A voided invoice is a cancelled ask, so its lesson is owed again. */
export const AVoidedInvoiceReleasesItsLesson: Story = {
  args: { invoices: [invoiceFor('lesson-1', 'void')] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Sep 17 – Oct 8')).toBeInTheDocument();
  },
};

/**
 * Fixing a date without leaving the conversation. Both actions hand the lesson
 * back to the page, which already owns the editor and the cancel confirmation.
 */
export const MovingADateInPlace: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: /^Move the lesson on Thu, Oct 1/ })
    );

    await expect(args.onMoveLesson).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lesson-3' })
    );
  },
};

export const SkippingAWeekAsksThePage: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: /^Skip the lesson on Thu, Oct 1/ })
    );

    await expect(args.onSkipLesson).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lesson-3' })
    );
  },
};

/**
 * Once the week is actually cancelled the block re-forms around it, so a
 * commitment to four lessons stays four lessons instead of quietly becoming
 * three.
 */
export const ACancelledWeekPullsTheNextDateIn: Story = {
  args: {
    lessons: lessons.map((l) =>
      l.id === 'lesson-3' ? lesson(3, { status: 'cancelled' }) : l
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('4 lessons')).toBeInTheDocument();
    // Oct 1 is gone and Oct 15 has joined; the total is unchanged.
    await expect(await canvas.findByText('Sep 17 – Oct 15')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: /Charge \$165\.00 to the card/ })
    ).toBeEnabled();
  },
};

/** Nothing left to commit to, said plainly rather than as an empty list. */
export const NothingLeftToCommitTo: Story = {
  args: { lessons: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/no upcoming lessons left to pay for/i)
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Charge the card' })
    ).toBeDisabled();
  },
};

/** Hope families bill through the EMA portal — this must not appear at all. */
export const HiddenForHopeStudents: Story = {
  args: { student: { ...student, isHopeScholarship: true } as Student },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByText('Commit and charge')
    ).not.toBeInTheDocument();
  },
};

/**
 * Nothing ticked charges nothing (#106).
 *
 * `planPrepayment` used to fall back to `lessonCount` for an empty selection, so
 * the picker offered "Charge $165.00 to the card · 4 lessons" while every
 * checkbox was clear — the screen and the charge disagreeing about what the
 * family agreed to.
 */
export const AnEmptyPickerOffersNothing: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Choose lessons instead' })
    );

    // No amount in the label, and nothing to press.
    const charge = canvas.getByRole('button', { name: 'Charge the card' });
    expect(charge).toBeDisabled();
    expect(
      canvas.queryByRole('button', { name: /Charge \$165\.00/ })
    ).not.toBeInTheDocument();
    expect(args.onCharge).not.toHaveBeenCalled();
  },
};

/** …and it does not nag about it, since that is where the picker starts. */
export const AnEmptyPickerDoesNotScold: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Choose lessons instead' })
    );
    expect(canvas.queryByText(/Tick the lessons/)).not.toBeInTheDocument();
  },
};

/**
 * Teaching already given (#128).
 *
 * `taught` are two lessons a fortnight and a week back, marked `rendered` and
 * never billed. They are the case Katie asked for: the studio taught them and
 * nobody has been asked to pay.
 */
const taught = [
  lesson(-2, { id: 'taught-1', status: 'rendered' }),
  lesson(-1, { id: 'taught-2', status: 'rendered' }),
];

/**
 * In count mode the picker is closed, so the debt has to announce itself —
 * otherwise the only person it helps is one who already knew to look.
 */
export const UnpaidTaughtLessonsAnnounceThemselves: Story = {
  args: { lessons: [...taught, ...lessons] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('2 lessons have been taught and not paid for.')
    ).toBeInTheDocument();
    // The count shortcut must still be pricing only the upcoming four.
    await expect(
      canvas.getByRole('button', { name: /Charge \$165\.00 to the card/ })
    ).toBeEnabled();
  },
};

/** One is one, not "1 lessons". */
export const OneUnpaidTaughtLesson: Story = {
  args: { lessons: [taught[1], ...lessons] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('1 lesson has been taught and not paid for.')
    ).toBeInTheDocument();
  },
};

/**
 * "Pick them" is the whole path from noticing to collecting: it opens the
 * picker with the owed lessons ticked and the total already reflecting them.
 */
export const PickingUpTheUnpaidOnes: Story = {
  args: { lessons: [...taught, ...lessons] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Pick them' }));

    await expect(
      await canvas.findByText('Already taught, not paid for')
    ).toBeInTheDocument();
    // Two owed lessons, ticked, and nothing else — $82.50.
    await expect(
      await canvas.findByRole('button', { name: /Charge \$82\.50 to the card/ })
    ).toBeEnabled();
  },
};

/**
 * Arriving from the attention row, which already knows which lesson it means.
 * The card opens in manual mode with that lesson ticked — a pre-tick behind a
 * closed picker would be a lie about what the button will charge.
 */
export const OpeningPreTickedFromElsewhere: Story = {
  args: {
    lessons: [...taught, ...lessons],
    preselectLessonIds: ['taught-1'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Already taught, not paid for')
    ).toBeInTheDocument();
    await expect(
      await canvas.findByRole('button', { name: /Charge \$41\.25 to the card/ })
    ).toBeEnabled();
  },
};

/**
 * A past lesson nobody marked taught is not offered. It is still `scheduled`,
 * so as far as this system knows the teaching did not happen — charging for it
 * would invent the fact that it did.
 */
export const APastLessonNobodyMarkedTaughtIsNotOffered: Story = {
  args: {
    lessons: [lesson(-3, { id: 'unmarked', status: 'scheduled' }), ...lessons],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /Charge \$165\.00 to the card/ })
    ).toBeEnabled();
    await expect(
      canvas.queryByText(/taught and not paid for/)
    ).not.toBeInTheDocument();
  },
};

/** Already invoiced means already asked for: the card must not ask twice. */
export const AnInvoicedTaughtLessonIsNotOwedAgain: Story = {
  args: {
    lessons: [...taught, ...lessons],
    invoices: [invoiceFor('taught-1'), invoiceFor('taught-2')],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /Charge \$165\.00 to the card/ })
    ).toBeEnabled();
    await expect(
      canvas.queryByText(/taught and not paid for/)
    ).not.toBeInTheDocument();
  },
};

/*
 * The student page splits the conversation into the two jobs Katie does, in
 * the order she does them: settle what was taught, then line up what is next.
 */

/**
 * Past lessons only. Nothing upcoming is offered, the count shortcut is gone
 * (a debt is never collected by "the next four"), and nothing is ticked until
 * Katie ticks it.
 */
export const OwedScopeListsOnlyTaughtLessons: Story = {
  args: { scope: 'owed', lessons: [...taught, ...lessons] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { name: 'Charge for past lessons' })
    ).toBeInTheDocument();
    await expect(canvas.getAllByRole('checkbox')).toHaveLength(2);
    await expect(canvas.queryByLabelText('Commit to')).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Choose lessons instead' })
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Charge the card' })
    ).toBeDisabled();

    await userEvent.click(canvas.getByRole('button', { name: 'Tick all 2' }));
    await expect(
      await canvas.findByRole('button', { name: /Charge \$82\.50 to the card/ })
    ).toBeEnabled();
  },
};

/** Nothing owed is one quiet line, not an empty picker. */
export const OwedScopeWithNothingOwed: Story = {
  args: { scope: 'owed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/Every lesson taught so far is paid for/)
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: /Charge/ })).toBeNull();
  },
};

/**
 * Still loading is not "nothing owed". Until the lessons land the card must
 * not tell Katie everything is paid for.
 */
export const OwedScopeWhileLoading: Story = {
  args: { scope: 'owed', lessons: [], isLoading: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText('Loading Charge for past lessons')
    ).toBeInTheDocument();
    await expect(canvas.queryByText(/Every lesson taught so far/)).toBeNull();
  },
};

/**
 * Upcoming only. The debt has its own card on the page, so it does not
 * announce itself here too, and the header carries the page's "Add lessons".
 */
export const UpcomingScopeLeavesPastLessonsAlone: Story = {
  args: {
    scope: 'upcoming',
    lessons: [...taught, ...lessons],
    headerAction: <button type="button">Add lessons</button>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { name: 'Next lessons' })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Add lessons' })
    ).toBeInTheDocument();
    await expect(canvas.queryByText(/taught and not paid for/)).toBeNull();
    await expect(
      canvas.getByRole('button', { name: /Charge \$165\.00 to the card/ })
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Choose lessons instead' })
    );
    await expect(canvas.queryByText('Already taught, not paid for')).toBeNull();
  },
};

/** Inside a dialog the card drops its own surface and heading. */
export const EmbeddedHasNoHeading: Story = {
  args: { scope: 'upcoming', embedded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /Charge \$165\.00 to the card/ })
    ).toBeEnabled();
    await expect(
      canvas.queryByRole('heading', { name: 'Next lessons' })
    ).toBeNull();
  },
};

/**
 * Settling lessons already taught is not paying ahead, so the confirmation
 * does not call it that. It still says the charge cannot be refunded here.
 */
export const ChargingPastLessonsIsNotCalledPayingAhead: Story = {
  args: { scope: 'owed', lessons: [...taught, ...lessons] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Tick all 2' }));
    await userEvent.click(
      await canvas.findByRole('button', { name: /Charge \$82\.50 to the card/ })
    );
    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByText(/no refund from here/i)).toBeInTheDocument();
    await expect(dialog.queryByText(/paying ahead/i)).toBeNull();
  },
};

/**
 * A student with nothing upcoming (no weekly time yet). The card becomes the
 * way to create lessons rather than a warning with disabled buttons.
 */
export const UpcomingWithNoLessonsOffersToCreateThem: Story = {
  args: {
    scope: 'upcoming',
    lessons: [],
    headerAction: <button type="button">Add lessons</button>,
    emptyActions: <button type="button">Set a weekly time</button>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/No upcoming lessons yet/)
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Set a weekly time' })
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: /Charge/ })).toBeNull();
    await expect(canvas.queryByRole('button', { name: /invoice/i })).toBeNull();
    await expect(canvas.queryByLabelText('Note (optional)')).toBeNull();
  },
};

/**
 * Two lessons made by hand, "the next 4" asked for. The card names the two
 * missing weeks and makes them in one click, copying the lesson that is there,
 * so charging for four is one step away rather than a trip through the form.
 */
export const FillingUpToTheNextFour: Story = {
  args: {
    scope: 'upcoming',
    lessons: [lesson(1), lesson(3)],
    onFillLessons: fn().mockResolvedValue(undefined),
    onPickOtherDates: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Only 2 of the next 4 lessons are on the calendar.')
    ).toBeInTheDocument();
    // Weeks 2 and 4: the gap between the two, and the week after.
    await expect(canvas.getByText(/Thu, Sep 24.*Thu, Oct 8/)).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Add 2 lessons' }));
    await expect(args.onFillLessons).toHaveBeenCalledWith({
      like: expect.objectContaining({ id: 'lesson-1' }),
      scheduledAts: [
        new Date(NOW.getTime() + 2 * 7 * DAY),
        new Date(NOW.getTime() + 4 * 7 * DAY),
      ],
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Other dates' }));
    await expect(args.onPickOtherDates).toHaveBeenCalled();
  },
};

/** Four already on the calendar: nothing to fill, no notice. */
export const NoFillOfferWhenFourExist: Story = {
  args: { scope: 'upcoming', onFillLessons: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /Charge \$165\.00 to the card/ });
    await expect(canvas.queryByText(/lessons are on the calendar/)).toBeNull();
  },
};

/** A failure to make the lessons is said in place, not swallowed. */
export const FillingFailsVisibly: Story = {
  args: {
    scope: 'upcoming',
    lessons: [lesson(1)],
    // An implementation passed to fn() survives Storybook's per-story mock
    // reset; a chained mockRejectedValue does not.
    onFillLessons: fn(async () => {
      throw new Error('That room is booked');
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Add 3 lessons' })
    );
    await expect(await canvas.findByText('That room is booked')).toBeInTheDocument();
  },
};

/**
 * Lessons made by hand often sit in no teaching block, and every lesson needs
 * one. When none fits, the fill adds one, and the notice says so before Katie
 * clicks rather than leaving a new block to be discovered later.
 */
export const FillingAddsABlockAndSaysSo: Story = {
  args: {
    scope: 'upcoming',
    lessons: [lesson(1), lesson(3)],
    onFillLessons: fn(async () => undefined),
    planFillBlock: () => ({
      blockStrategy: { mode: 'create' },
      note: 'No teaching block covers that time, so this also adds a Thursday 8:00 AM to 8:30 AM block for Test Teacher.',
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/this also adds a Thursday 8:00 AM to 8:30 AM block/)
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Add 2 lessons' }));
    await expect(args.onFillLessons).toHaveBeenCalledWith(
      expect.objectContaining({ blockStrategy: { mode: 'create' } })
    );
  },
};

/** No block can hold them: say why, and keep the one-click fill off. */
export const FillingBlockedExplainsWhy: Story = {
  args: {
    scope: 'upcoming',
    lessons: [lesson(1), lesson(3)],
    onFillLessons: fn(async () => undefined),
    onPickOtherDates: fn(),
    planFillBlock: () => ({
      blocked: 'This lesson runs past midnight, which no block can cover.',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/runs past midnight/)
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Add 2 lessons' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Other dates' })).toBeEnabled();
  },
};

/**
 * No rate set: nothing can be charged, but the dates are still listed, because
 * lining up the next lessons does not depend on taking money for them.
 */
export const DatesShowEvenWithoutARate: Story = {
  args: { scope: 'upcoming', rateByLength: {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('This covers')).toBeInTheDocument();
    await expect(canvas.getByText('Sep 17 – Oct 8')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Charge the card' })
    ).toBeDisabled();
  },
};
