import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { mockGiftCardTotals } from '@maple/react/storybook-fixtures';
import { GiftCardTotalsCards } from './GiftCardTotalsCards';

const meta = {
  component: GiftCardTotalsCards,
  title: 'Gift Cards/GiftCardTotalsCards',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GiftCardTotalsCards>;

export default meta;
type Story = StoryObj<typeof GiftCardTotalsCards>;

export const Loaded: Story = {
  args: { totalsState: { status: 'success', data: mockGiftCardTotals } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Owed to customers')).toBeVisible();
    await expect(canvas.getByText('$62.50')).toBeVisible();
    await expect(canvas.getByText('$125.00')).toBeVisible();
    await expect(canvas.getByText('$42.50')).toBeVisible();
    await expect(canvas.getByText(/Printed certificates count once they are sold/)).toBeVisible();
    await expect(canvas.getByText('Given free this month')).toBeVisible();
    await expect(canvas.getByText('$25.00')).toBeVisible();
    // Unsold certificates hold no money, so they are a count, not dollars (#332).
    await expect(canvas.getByText('Printed, not sold yet')).toBeVisible();
    await expect(canvas.getByText('10 certificates')).toBeVisible();
    await expect(canvas.getByText(/no money on them/)).toBeVisible();
  },
};

export const OneCertificateNotSold: Story = {
  args: {
    totalsState: {
      status: 'success',
      data: { ...mockGiftCardTotals, printedNotSoldCount: 1 },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('1 certificate')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { totalsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Loading gift card totals')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByText('$0.00')).toBeNull();
  },
};

export const Error: Story = {
  args: { totalsState: { status: 'error', error: 'Square is unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Square is unavailable');
  },
};
