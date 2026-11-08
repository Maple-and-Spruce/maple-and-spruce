import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { mockGiftCards } from '@maple/react/storybook-fixtures';
import { GiftCardsTable } from './GiftCardsTable';

const meta = {
  component: GiftCardsTable,
  title: 'Gift Cards/GiftCardsTable',
  parameters: { layout: 'padded' },
  args: { onSelect: fn() },
} satisfies Meta<typeof GiftCardsTable>;

export default meta;
type Story = StoryObj<typeof GiftCardsTable>;

export const WithCards: Story = {
  args: { cardsState: { status: 'success', data: mockGiftCards } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('row')).toHaveLength(mockGiftCards.length + 1);
    await expect(canvas.getByText('Blocked')).toBeVisible();
    await expect(canvas.getByText('Plastic card')).toBeVisible();

    await userEvent.click(canvas.getByRole('row', { name: 'Gift card ending 0937' }));
    await expect(args.onSelect).toHaveBeenCalledWith(mockGiftCards[1]);
  },
};

export const SearchByLastDigits: Story = {
  args: { cardsState: { status: 'success', data: mockGiftCards } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByLabelText('Last 4 digits');

    await userEvent.type(search, '48');
    await expect(canvas.getByRole('row', { name: 'Gift card ending 4821' })).toBeVisible();
    await expect(canvas.queryByRole('row', { name: 'Gift card ending 0937' })).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, '9999');
    await expect(canvas.getByText('No gift card ends in 9999.')).toBeVisible();
  },
};

export const Empty: Story = {
  args: { cardsState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/No gift cards yet/)).toBeVisible();
  },
};

/** Loading is never drawn as "no gift cards". */
export const Loading: Story = {
  args: { cardsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('table', { name: 'Gift cards' })).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByText(/No gift cards yet/)).toBeNull();
    await expect(canvas.getByLabelText('Last 4 digits')).toBeDisabled();
  },
};

export const Error: Story = {
  args: { cardsState: { status: 'error', error: 'Square is unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Square is unavailable');
    await expect(canvas.queryByText(/No gift cards yet/)).toBeNull();
  },
};
