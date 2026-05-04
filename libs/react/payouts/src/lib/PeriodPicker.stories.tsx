import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { PeriodPicker, monthRangeFor } from './PeriodPicker';

const april = monthRangeFor(new Date('2026-04-15T00:00:00Z'));

const meta = {
  component: PeriodPicker,
  title: 'Payouts/PeriodPicker',
  parameters: { layout: 'padded' },
  args: {
    from: april.from,
    to: april.to,
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
    // Compute the expected range using the same `new Date()` semantics the
    // component uses, so the assertion stays correct regardless of which
    // month "today" happens to be. (The previous version compared against
    // a hardcoded April reference and broke every May 1st.)
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
