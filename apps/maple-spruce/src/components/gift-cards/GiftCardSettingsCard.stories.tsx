import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within } from 'storybook/test';
import { DEFAULT_GIFT_CARD_AMOUNT_SETTINGS } from '@maple/ts/domain';
import { GiftCardSettingsCard } from './GiftCardSettingsCard';

/** Admin > Settings > Gift cards (#309). */
const meta = {
  title: 'Settings/GiftCardSettingsCard',
  component: GiftCardSettingsCard,
  parameters: { layout: 'padded' },
  args: {
    settingsState: { status: 'success', data: DEFAULT_GIFT_CARD_AMOUNT_SETTINGS },
    isSaving: false,
    onSave: fn(async () => undefined),
  },
} satisfies Meta<typeof GiftCardSettingsCard>;
export default meta;
type Story = StoryObj<typeof GiftCardSettingsCard>;

const save = (canvas: ReturnType<typeof within>) =>
  canvas.getByRole('button', { name: 'Save gift card amounts' });

async function retype(field: HTMLElement, value: string) {
  await userEvent.clear(field);
  if (value) await userEvent.type(field, value);
}

/** The shipped amounts, and nothing to save until something changes. */
export const Defaults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Amount 1')).toHaveValue('25');
    await expect(canvas.getByLabelText('Amount 2')).toHaveValue('50');
    await expect(canvas.getByLabelText('Amount 3')).toHaveValue('100');
    await expect(canvas.getByLabelText('Lowest amount')).toHaveValue('10');
    await expect(canvas.getByLabelText('Highest amount')).toHaveValue('500');
    await expect(save(canvas)).toBeDisabled();
  },
};

/** Katie adds a $250 amount and widens the range; it saves smallest first. */
export const AddAmountAndWidenRange: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add an amount' }));
    await userEvent.type(canvas.getByLabelText('Amount 4'), '250');
    await retype(canvas.getByLabelText('Lowest amount'), '5');
    await retype(canvas.getByLabelText('Highest amount'), '1000');
    // A fifth amount is not allowed.
    await expect(canvas.getByRole('button', { name: 'Add an amount' })).toBeDisabled();

    await userEvent.click(save(canvas));
    await expect(args.onSave).toHaveBeenCalledWith({
      presetCents: [2500, 5000, 10000, 25000],
      minCents: 500,
      maxCents: 100000,
    });
    await expect(await canvas.findByText('Saved.')).toBeInTheDocument();
  },
};

/** Removing an amount; the last one cannot be removed. */
export const RemoveAmounts: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove amount 3' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Remove amount 2' }));
    await expect(canvas.getByRole('button', { name: 'Remove amount 1' })).toBeDisabled();
    await userEvent.click(save(canvas));
    await expect(args.onSave).toHaveBeenCalledWith({
      presetCents: [2500],
      minCents: 1000,
      maxCents: 50000,
    });
  },
};

/** Each rule says why, and the card cannot be saved until it is fixed. */
export const RefusesBadAmounts: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await retype(canvas.getByLabelText('Lowest amount'), '4');
    await expect(canvas.getByText('The lowest amount must be at least $5')).toBeInTheDocument();
    await expect(save(canvas)).toBeDisabled();

    await retype(canvas.getByLabelText('Lowest amount'), '10');
    await retype(canvas.getByLabelText('Highest amount'), '1500');
    await expect(canvas.getByText('The highest amount can be at most $1000')).toBeInTheDocument();

    await retype(canvas.getByLabelText('Highest amount'), '75');
    await expect(
      canvas.getByText('Each amount must be between the lowest and the highest')
    ).toBeInTheDocument();

    await retype(canvas.getByLabelText('Highest amount'), '500');
    await retype(canvas.getByLabelText('Amount 1'), '12.50');
    await expect(canvas.getByText('Each amount must be in whole dollars')).toBeInTheDocument();

    await retype(canvas.getByLabelText('Amount 1'), '9');
    await retype(canvas.getByLabelText('Lowest amount'), '20');
    await retype(canvas.getByLabelText('Highest amount'), '20');
    await expect(
      canvas.getByText('The highest amount must be more than the lowest')
    ).toBeInTheDocument();

    await expect(save(canvas)).toBeDisabled();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

export const SaveFails: Story = {
  args: {
    onSave: fn(async () => {
      throw new Error('Validation failed: maxCents: The highest amount can be at most $1000');
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await retype(canvas.getByLabelText('Amount 1'), '30');
    await userEvent.click(save(canvas));
    await expect(await canvas.findByText(/Validation failed/)).toBeInTheDocument();
  },
};

/** Loading: a skeleton, never empty fields. */
export const Loading: Story = {
  args: { settingsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Loading gift card amounts')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByLabelText('Lowest amount')).toBeNull();
  },
};

export const LoadError: Story = {
  args: { settingsState: { status: 'error', error: 'permission-denied' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Could not load gift card amounts: permission-denied')
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Save gift card amounts' })).toBeNull();
  },
};
