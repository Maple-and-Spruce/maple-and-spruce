import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  mockGiftCardActivities,
  mockGiftCardCode,
  mockGiftCards,
} from '@maple/react/storybook-fixtures';
import { GiftCardDetailDialog } from './GiftCardDetailDialog';

const card = mockGiftCards[1];
const body = () => within(document.body);

const meta = {
  component: GiftCardDetailDialog,
  title: 'Gift Cards/GiftCardDetailDialog',
  parameters: { layout: 'centered' },
  args: {
    card,
    detailState: {
      status: 'success',
      data: { card, activities: mockGiftCardActivities },
    },
    onClose: fn(),
    onRevealCode: fn(async () => mockGiftCardCode),
    copyToClipboard: fn(async () => undefined),
  },
} satisfies Meta<typeof GiftCardDetailDialog>;

export default meta;
type Story = StoryObj<typeof GiftCardDetailDialog>;

/** Balance and history in plain words; the code is hidden until asked for. */
export const History: Story = {
  play: async ({ args }) => {
    const canvas = body();
    // The dialog fades in, so wait for it to be fully shown.
    await waitFor(() => expect(canvas.getByText('Gift card ending 0937')).toBeVisible());
    await expect(canvas.getByText('$12.50')).toBeVisible();
    const history = canvas.getByRole('list', { name: 'Card history' });
    await expect(within(history).getByText('Sold')).toBeVisible();
    await expect(within(history).getByText('Money added')).toBeVisible();
    await expect(within(history).getByText('Spent')).toBeVisible();
    await expect(within(history).getByText('−$37.50')).toBeVisible();
    await expect(canvas.queryByTestId('gift-card-code')).toBeNull();
    await expect(args.onRevealCode).not.toHaveBeenCalled();
  },
};

/** One click fetches the code, shows it in groups of four and copies it. */
export const ShowAndCopyCode: Story = {
  play: async ({ args }) => {
    const canvas = body();
    await userEvent.click(await canvas.findByRole('button', { name: 'Show and copy code' }));
    await expect(await canvas.findByTestId('gift-card-code')).toHaveTextContent('7783 3200 0000 4821');
    await expect(args.onRevealCode).toHaveBeenCalledWith(card.id);
    await expect(args.copyToClipboard).toHaveBeenCalledWith(mockGiftCardCode);
    await expect(canvas.getByRole('status')).toHaveTextContent('Copied');
  },
};

/** If the browser blocks the clipboard, the code is still there to copy by hand. */
export const CopyBlocked: Story = {
  args: {
    copyToClipboard: fn(async () => {
      throw new Error('denied');
    }),
  },
  play: async () => {
    const canvas = body();
    await userEvent.click(await canvas.findByRole('button', { name: 'Show and copy code' }));
    await expect(await canvas.findByTestId('gift-card-code')).toBeVisible();
    await expect(canvas.getByRole('status')).toHaveTextContent('copy it by hand');
  },
};

export const RevealFails: Story = {
  args: {
    onRevealCode: fn(async () => {
      throw new Error('Square is unavailable');
    }),
  },
  play: async () => {
    const canvas = body();
    await userEvent.click(await canvas.findByRole('button', { name: 'Show and copy code' }));
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent('Square is unavailable')
    );
    await expect(canvas.queryByTestId('gift-card-code')).toBeNull();
  },
};

/** While the history loads, it is never shown as "nothing has happened". */
export const LoadingHistory: Story = {
  args: { detailState: { status: 'loading' } },
  play: async () => {
    const canvas = body();
    await expect(await canvas.findByLabelText('Loading history')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByText(/Nothing has happened/)).toBeNull();
    // The balance from the table row shows straight away.
    await waitFor(() => expect(canvas.getByText('$12.50')).toBeVisible());
  },
};

export const HistoryFails: Story = {
  args: { detailState: { status: 'error', error: 'Square is unavailable' } },
  play: async () => {
    const canvas = body();
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Square is unavailable');
  },
};
