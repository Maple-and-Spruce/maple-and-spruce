import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within } from 'storybook/test';
import { UpcomingChargesCard } from './UpcomingChargesCard';
import type { LessonScheduledCharge } from '@maple/ts/domain';

const NOW = new Date('2026-09-10T12:00:00Z');
const DAY = 86_400_000;

let seq = 0;
function charge(
  over: Partial<LessonScheduledCharge> = {}
): LessonScheduledCharge {
  seq++;
  return {
    id: `chg-${seq}`,
    studentId: 'stu-delphine',
    ruleId: 'rule-1',
    lessonIds: ['l1', 'l2', 'l3', 'l4'],
    amountCents: 16500,
    dueAt: new Date(NOW.getTime() + 3 * DAY),
    status: 'scheduled',
    idempotencyKey: `lesson-chg-${seq}`,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const studentNames = {
  'stu-delphine': 'Delphine Cray',
  'stu-devin': 'Devin Marlowe',
  'stu-elowen': 'Elowen Ridley',
};

const meta = {
  component: UpcomingChargesCard,
  title: 'Lessons/UpcomingChargesCard',
  parameters: { layout: 'padded' },
  args: {
    now: NOW,
    studentNames,
    charges: [
      charge({ studentId: 'stu-delphine', dueAt: new Date(NOW.getTime() + 3 * DAY) }),
      charge({ studentId: 'stu-elowen', dueAt: new Date(NOW.getTime() + 10 * DAY), amountCents: 8250 }),
    ],
    isLoading: false,
    pendingId: null,
    error: null,
    onCancel: fn(),
    onWaive: fn(),
  },
} satisfies Meta<typeof UpcomingChargesCard>;

export default meta;
type Story = StoryObj<typeof UpcomingChargesCard>;

export const Upcoming: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The total is the number Katie checks before letting a run go ahead.
    expect(await canvas.findByText(/Upcoming — \$247\.50/)).toBeTruthy();
  },
};

/** Nothing scheduled — and the reason why, so it does not read as broken. */
export const NothingScheduled: Story = {
  args: { charges: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/only charged automatically once a student is on a billing rule/i)
    ).toBeTruthy();
  },
};

/**
 * A failed charge is money already earned and not collected, and nothing
 * retries it. It outranks everything in the future.
 */
export const FailedChargesComeFirst: Story = {
  args: {
    charges: [
      charge({ dueAt: new Date(NOW.getTime() + 5 * DAY) }),
      charge({
        studentId: 'stu-devin',
        status: 'failed',
        lastError: 'CARD_DECLINED',
        dueAt: new Date(NOW.getTime() - 2 * DAY),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(await canvas.findByText(/1 charge failed/i)).toBeTruthy();
    expect(await canvas.findByText(/nothing retries on its own/i)).toBeTruthy();
    // The chip carries the state; the line beneath carries the reason, once.
    expect(await canvas.findByText('Failed')).toBeTruthy();
    expect(await canvas.findByText('CARD_DECLINED')).toBeTruthy();
  },
};

/**
 * A failed charge holds its lessons until someone deals with it (#102), so the
 * row has to offer both ways out: try the card again, or stop the charge.
 * Without Waive/Cancel here those lessons could never be released at all.
 */
export const FailedChargeOffersAWayOut: Story = {
  args: {
    charges: [
      charge({
        studentId: 'stu-devin',
        status: 'failed',
        lastError: 'CARD_DECLINED',
        dueAt: new Date(NOW.getTime() - 2 * DAY),
      }),
    ],
    onRetry: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(await canvas.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(await canvas.findByRole('button', { name: 'Waive' })).toBeTruthy();
    expect(await canvas.findByRole('button', { name: 'Cancel' })).toBeTruthy();
    // The state still reads at a glance.
    expect(await canvas.findByText('Failed')).toBeTruthy();
  },
};

/** An overdue scheduled charge is the shape of a family with no card. */
export const OverdueStaysVisible: Story = {
  args: {
    charges: [
      charge({ dueAt: new Date(NOW.getTime() - 30 * DAY), studentId: 'stu-devin' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/Due now/i)).toBeTruthy();
  },
};

export const CancelsACharge: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const cancels = await canvas.findAllByRole('button', { name: 'Cancel' });
    await userEvent.click(cancels[0]);

    expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};

/** Waiving takes a reason, so a comped block stays legible months later. */
export const WaivingRequiresAReason: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await userEvent.click((await canvas.findAllByRole('button', { name: 'Waive' }))[0]);

    const confirm = await canvas.findByRole('button', { name: /^Waive \$/ });
    expect(confirm).toBeDisabled();

    await userEvent.type(
      await canvas.findByLabelText('Reason'),
      'Makeup for a lesson we cancelled'
    );
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(args.onWaive).toHaveBeenCalledWith(
      expect.any(String),
      'Makeup for a lesson we cancelled'
    );
  },
};

/** A charge already in flight cannot be stopped, and says so. */
export const AChargeInFlightCannotBeStopped: Story = {
  args: { charges: [charge({ status: 'charging' })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(await canvas.findByText('Being charged now')).toBeTruthy();
    expect(canvas.queryByRole('button', { name: 'Waive' })).toBeNull();
    expect(canvas.queryByRole('button', { name: 'Cancel' })).toBeNull();
  },
};

/** Settled charges stay readable, including why one was waived. */
export const SettledHistory: Story = {
  args: {
    charges: [
      charge({ status: 'paid', dueAt: new Date(NOW.getTime() - 10 * DAY) }),
      charge({
        status: 'waived',
        waivedReason: 'Makeup for a lesson we cancelled',
        dueAt: new Date(NOW.getTime() - 20 * DAY),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('Paid')).toBeTruthy();
    expect(await canvas.findByText('Waived')).toBeTruthy();
    expect(
      await canvas.findByText('Makeup for a lesson we cancelled')
    ).toBeTruthy();
  },
};

/** On a student's page the name is redundant on every row. */
export const OnAStudentPage: Story = {
  args: { hideStudent: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText('Delphine Cray')).toBeNull();
  },
};
