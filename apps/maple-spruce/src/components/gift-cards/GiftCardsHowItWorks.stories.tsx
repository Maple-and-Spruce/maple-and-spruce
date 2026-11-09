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
    await expect(canvas.getByText('Printed certificates')).toBeVisible();
    // #332: printed with nothing on them, loaded at the iPad when sold.
    await expect(canvas.getByText(/no money on them/)).toBeVisible();
    await expect(canvas.getByText(/Check Balance/)).toBeVisible();
    await expect(canvas.getByText(/Add the customer to the sale/)).toBeVisible();
    await expect(canvas.getByText(/is not\s+needed/)).toBeVisible();
    await expect(canvas.getByText('A lost card')).toBeVisible();
    await expect(canvas.getByText('Replace lost card')).toBeVisible();
    await expect(canvas.getByText(/name, email or phone\. A customer search/)).toBeVisible();
    await expect(canvas.queryByText(/leave tax off/)).toBeNull();
    await expect(canvas.getByText(/gift card page of our own website/)).toBeVisible();
    await expect(canvas.queryByText(/eGift card page/)).toBeNull();
    await expect(canvas.getByText('Treat the code like cash')).toBeVisible();
    await expect(canvas.getByText(/Music Together is a separate Square/)).toBeVisible();
    await expect(canvas.getByText(/is not a sale, has no sales tax/)).toBeVisible();
    await expect(canvas.getByText('Make it a class certificate')).toBeVisible();
    await expect(canvas.getByText('Giving a card for free')).toBeVisible();
    await expect(canvas.getByText(/nobody pays for it/)).toBeVisible();
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
