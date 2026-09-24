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
