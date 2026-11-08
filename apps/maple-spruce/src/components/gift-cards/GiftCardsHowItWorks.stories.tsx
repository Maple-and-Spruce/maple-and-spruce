import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { GiftCardsHowItWorks } from './GiftCardsHowItWorks';

const meta = {
  component: GiftCardsHowItWorks,
  title: 'Gift Cards/GiftCardsHowItWorks',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GiftCardsHowItWorks>;

export default meta;
type Story = StoryObj<typeof GiftCardsHowItWorks>;

/** Open by default, with the certificate steps and the cash warning spelled out. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'How gift cards work' })).toBeVisible();
    await expect(canvas.getByText('Making a printed certificate')).toBeVisible();
    await expect(canvas.getByText('Treat the code like cash')).toBeVisible();
    await expect(canvas.getByText(/Music Together is a separate Square/)).toBeVisible();
    await expect(canvas.getByText(/is not a sale, has no sales tax/)).toBeVisible();
  },
};

export const CanBeHidden: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: 'Hide' });
    await userEvent.click(toggle);
    await expect(canvas.getByRole('button', { name: 'Show' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  },
};
