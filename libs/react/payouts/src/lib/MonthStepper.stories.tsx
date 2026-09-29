import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MonthStepper } from './MonthStepper';

const meta = {
  component: MonthStepper,
  title: 'Payouts/MonthStepper',
  args: { month: '2026-12', onChange: fn() },
} satisfies Meta<typeof MonthStepper>;

export default meta;
type Story = StoryObj<typeof MonthStepper>;

export const StepsAcrossTheYear: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('December 2026')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Next month' }));
    expect(args.onChange).toHaveBeenLastCalledWith('2027-01');
    await userEvent.click(canvas.getByRole('button', { name: 'Previous month' }));
    expect(args.onChange).toHaveBeenLastCalledWith('2026-11');
  },
};
