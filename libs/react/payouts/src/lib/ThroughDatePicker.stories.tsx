import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { ThroughDatePicker } from './ThroughDatePicker';

const TODAY = '2026-11-21';

const meta = {
  component: ThroughDatePicker,
  title: 'Payouts/ThroughDatePicker',
  parameters: { layout: 'padded' },
  args: { value: '', onChange: fn(), today: TODAY },
} satisfies Meta<typeof ThroughDatePicker>;

export default meta;
type Story = StoryObj<typeof ThroughDatePicker>;

/** Starts on today, which means every finished class: no cutoff, nothing to reset. */
export const Today: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText('Classes held through')).toHaveValue(TODAY);
    expect(canvas.queryByRole('button', { name: 'Back to today' })).toBeNull();
  },
};

/** Picking an earlier day sets the cutoff; "Back to today" clears it. */
export const PickAnEarlierDay: Story = {
  render: function Controlled(args) {
    const [value, setValue] = useState('');
    return (
      <ThroughDatePicker
        {...args}
        value={value}
        onChange={(next) => {
          args.onChange(next);
          setValue(next);
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByLabelText('Classes held through');
    fireEvent.change(field, { target: { value: '2026-11-08' } });
    expect(args.onChange).toHaveBeenLastCalledWith('2026-11-08');
    expect(field).toHaveValue('2026-11-08');

    await userEvent.click(canvas.getByRole('button', { name: 'Back to today' }));
    expect(args.onChange).toHaveBeenLastCalledWith('');
    expect(field).toHaveValue(TODAY);
  },
};

/** Today and anything later mean the same as no cutoff. */
export const TodayOrLaterIsNoCutoff: Story = {
  args: { value: '2026-11-08' },
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByLabelText('Classes held through');
    fireEvent.change(field, { target: { value: TODAY } });
    expect(args.onChange).toHaveBeenLastCalledWith('');
    fireEvent.change(field, { target: { value: '2026-12-01' } });
    expect(args.onChange).toHaveBeenLastCalledWith('');
  },
};
