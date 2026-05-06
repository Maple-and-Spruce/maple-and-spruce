import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { PeriodPicker, monthRangeFor } from './PeriodPicker';

// Seed default args with the *current* month. The "Previous month" quick-pick
// always emits `monthRangeFor(new Date(), -1)`, so the test below can assert
// equality against that same expression — independent of wall-clock month.
const thisMonth = monthRangeFor(new Date());

const meta = {
  component: PeriodPicker,
  title: 'Payouts/PeriodPicker',
  parameters: { layout: 'padded' },
  args: {
    from: thisMonth.from,
    to: thisMonth.to,
    onChange: fn(),
  },
} satisfies Meta<typeof PeriodPicker>;

export default meta;
type Story = StoryObj<typeof PeriodPicker>;

export const Default: Story = {};

export const PreviousMonthClickedFiresOnChange: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button', { name: /previous month/i });
    // Compute expected adjacent to the click so both `new Date()` calls
    // (here and in the component's onClick) land in the same wall-clock
    // moment — no month-boundary races.
    const expected = monthRangeFor(new Date(), -1);
    await userEvent.click(btn);
    await waitFor(() => {
      expect(args.onChange).toHaveBeenCalledTimes(1);
      const arg = (args.onChange as ReturnType<typeof fn>).mock.calls[0][0];
      expect(arg.from).toBeInstanceOf(Date);
      expect(arg.to).toBeInstanceOf(Date);
      expect(arg.from.getTime()).toBe(expected.from.getTime());
      expect(arg.to.getTime()).toBe(expected.to.getTime());
    });
  },
};

export const ThisMonthClickedFiresOnChange: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button', { name: /this month/i });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(args.onChange).toHaveBeenCalledTimes(1);
    });
  },
};

export const ApplyDisabledUntilDraftChanges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const apply = canvas.getByRole('button', { name: /apply/i });
    // Disabled when drafts match props.
    expect(apply).toBeDisabled();
  },
};
