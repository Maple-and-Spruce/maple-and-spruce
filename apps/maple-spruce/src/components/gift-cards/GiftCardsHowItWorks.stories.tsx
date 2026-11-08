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
    await expect(canvas.getByText(/spent as soon as it is printed/)).toBeVisible();
    await expect(canvas.getByText(/leave tax off/)).toBeVisible();
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
