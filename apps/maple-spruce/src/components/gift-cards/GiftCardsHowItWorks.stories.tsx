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

/** Short: a few essentials, and every task folded away until it is needed. */
export const Short: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'How gift cards work' })).toBeVisible();
    await expect(canvas.getByText(/as good as cash/)).toBeVisible();
    await expect(canvas.getByText(/never expire/)).toBeVisible();
    await expect(canvas.getByText(/not Music Together/)).toBeVisible();
    // The steps start folded away.
    for (const task of [
      'Sell a printed certificate',
      'Sell an eGift card at the register',
      'Give a card for free',
      'Replace a lost card',
      'Refund or turn off a card',
    ]) {
      await expect(canvas.getByRole('button', { name: task })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    }
    await expect(canvas.queryByText(/Check Balance/)).not.toBeVisible();
    await expect(canvasElement.textContent).not.toMatch(/—/);
  },
};

/** Opening a task shows its steps. */
export const OpenATask: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sell a printed certificate' }));
    await expect(await canvas.findByText(/Check Balance/)).toBeVisible();
    await expect(canvas.getByText(/add the customer to the sale/)).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Refund or turn off a card' }));
    await expect(await canvas.findByText(/What is left goes back to the card that paid/)).toBeVisible();
  },
};
