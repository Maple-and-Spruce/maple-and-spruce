import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within, screen } from 'storybook/test';
import { NextLessonsPanel } from './NextLessonsPanel';
import type { NextLessonItem } from './next-lessons';

const at = (iso: string) => new Date(iso);

/** Tuesdays at 4:00 PM Eastern. */
const fourNew: NextLessonItem[] = [
  '2026-10-06T20:00:00Z',
  '2026-10-13T20:00:00Z',
  '2026-10-20T20:00:00Z',
  '2026-10-27T20:00:00Z',
].map((iso) => ({
  key: `new-${iso}`,
  scheduledAt: at(iso),
  durationMinutes: 45,
}));

const oneBookedThreeNew: NextLessonItem[] = [
  { ...fourNew[0], key: 'lesson-booked', lessonId: 'lesson-booked' },
  ...fourNew.slice(1),
];

const meta: Meta<typeof NextLessonsPanel> = {
  title: 'Lessons/NextLessonsPanel',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
  component: NextLessonsPanel,
  args: {
    viewState: { status: 'success', data: { items: fourNew, noSlot: false } },
    priceOf: () => 4500,
    isHope: false,
    cardLabel: 'Visa ••4242',
    busy: false,
    onSkip: fn(),
    onMove: fn(),
    onCharge: fn(),
    onInvoice: fn(),
    onBook: fn(),
    onSetWeeklyTime: fn(),
    onBookMore: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof NextLessonsPanel>;

/** The everyday case: four dates, a card, one button. */
export const ChargeTheCard: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Next 4 lessons')).toBeInTheDocument();
    await expect(canvas.getByText('Total $180.00')).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Charge $180.00 to Visa ••4242' })
    );
    await expect(args.onCharge).toHaveBeenCalledTimes(1);
    // One way to pay, not a menu of them.
    await expect(
      canvas.queryByRole('button', { name: /invoice/i })
    ).not.toBeInTheDocument();
  },
};

/** No card: say so plainly, and offer the invoice. */
export const NoCardOnFile: Story = {
  args: { cardLabel: undefined },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No card on file.')).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /^Charge/ })
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Send an invoice for $180.00' })
    );
    await expect(args.onInvoice).toHaveBeenCalledTimes(1);
  },
};

/** A lesson already on the calendar is part of the four, and says so. */
export const OneAlreadyBooked: Story = {
  args: {
    viewState: {
      status: 'success',
      data: { items: oneBookedThreeNew, noSlot: false },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByText('Already on the calendar')
    ).toHaveLength(1);
    await expect(
      canvas.getByRole('button', { name: 'Charge $180.00 to Visa ••4242' })
    ).toBeEnabled();
  },
};

/** Skipping a week hands the item back to the page, which proposes the next. */
export const SkipAWeek: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const skips = canvas.getAllByRole('button', { name: /^Skip/ });
    await userEvent.click(skips[1]);
    await expect(args.onSkip).toHaveBeenCalledWith(fourNew[1]);
  },
};

/** Moving a date: pick a time, confirm, and the page gets the new one. */
export const MoveADate: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole('button', { name: /^Move/ })[0]);
    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByText('Move this lesson')).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Move' }));
    await expect(args.onMove).toHaveBeenCalledWith(
      fourNew[0],
      fourNew[0].scheduledAt
    );
  },
};

/** Hope students are billed through EMA: book, never charge. */
export const HopeBooksOnly: Story = {
  args: {
    isHope: true,
    viewState: {
      status: 'success',
      data: { items: oneBookedThreeNew, noSlot: false },
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole('button', { name: /Charge|invoice/i })
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText(/Total/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Book 3 lessons' }));
    await expect(args.onBook).toHaveBeenCalledTimes(1);
  },
};

export const HopeAllBooked: Story = {
  args: {
    isHope: true,
    viewState: {
      status: 'success',
      data: {
        items: fourNew.map((i, n) => ({ ...i, key: `l${n}`, lessonId: `l${n}` })),
        noSlot: false,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('These lessons are all on the calendar.')
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /^Book/ })
    ).not.toBeInTheDocument();
  },
};

export const NoWeeklyTime: Story = {
  args: { viewState: { status: 'success', data: { items: [], noSlot: true } } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Set a weekly time' })
    );
    await expect(args.onSetWeeklyTime).toHaveBeenCalledTimes(1);
  },
};

export const NoRateSet: Story = {
  args: { priceOf: () => 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/No lesson rate is set for this student/)
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /^Charge/ })
    ).not.toBeInTheDocument();
  },
};

/** While paying, nothing can be pressed twice. */
export const Paying: Story = {
  args: { busy: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Charge $180.00 to Visa ••4242' })
    ).toBeDisabled();
    for (const skip of canvas.getAllByRole('button', { name: /^Skip/ })) {
      await expect(skip).toBeDisabled();
    }
  },
};

/** Booked but the card declined: the lessons stay booked and can be paid again. */
export const ChargeFailed: Story = {
  args: {
    error: 'Booked 4 lessons, but the card was declined. Try again or send an invoice.',
    viewState: {
      status: 'success',
      data: {
        items: fourNew.map((i, n) => ({ ...i, key: `l${n}`, lessonId: `l${n}` })),
        noSlot: false,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/card was declined/)).toBeInTheDocument();
    await expect(canvas.getAllByText('Already on the calendar')).toHaveLength(4);
    await expect(
      canvas.getByRole('button', { name: 'Charge $180.00 to Visa ••4242' })
    ).toBeEnabled();
  },
};

/**
 * Straight after paying, only the confirmation: proposing the following four
 * with another Charge button would invite charging twice.
 */
export const JustPaid: Story = {
  args: { notice: 'Charged $180.00 for Oct 6, 13, 20 and 27.' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Charged \$180\.00/)).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /^Charge/ })
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Book more lessons' }));
    await expect(args.onBookMore).toHaveBeenCalledTimes(1);
  },
};

export const Loading: Story = {
  args: { viewState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvasElement.querySelector('[aria-busy="true"]')
    ).not.toBeNull();
    await expect(canvas.queryByText(/No weekly time/)).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const LoadFailed: Story = {
  args: { viewState: { status: 'error', error: 'network down' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Could not load the next lessons: network down')
    ).toBeInTheDocument();
    await expect(canvas.queryByText(/No weekly time/)).not.toBeInTheDocument();
  },
};
