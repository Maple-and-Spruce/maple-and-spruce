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
    await userEvent.click(btn);
    await waitFor(() => {
      expect(args.onChange).toHaveBeenCalledTimes(1);
      const arg = (args.onChange as ReturnType<typeof fn>).mock.calls[0][0];
      expect(arg.from).toBeInstanceOf(Date);
      expect(arg.to).toBeInstanceOf(Date);
      // Previous month from April → March
      expect(arg.from.getMonth() < april.from.getMonth()).toBe(true);
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
