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

/** The dialog fades in; wait until it is fully shown before acting on it. */
async function openDialog() {
  const canvas = body();
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible());
  await waitFor(() =>
    expect(getComputedStyle(canvas.getByRole('dialog').parentElement!).opacity).toBe('1')
  );
  return canvas;
}

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
    const canvas = await openDialog();
    await expect(canvas.getByText('Gift card ending 0937')).toBeVisible();
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
    const canvas = await openDialog();
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
    const canvas = await openDialog();
    await userEvent.click(await canvas.findByRole('button', { name: 'Show and copy code' }));
    await waitFor(() => expect(canvas.getByTestId('gift-card-code')).toBeVisible());
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
    const canvas = await openDialog();
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
    const canvas = await openDialog();
    await expect(await canvas.findByLabelText('Loading history')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByText(/Nothing has happened/)).toBeNull();
    // The balance from the table row shows straight away.
    await waitFor(() => expect(canvas.getByText('$12.50')).toBeVisible());
  },
};

export const HistoryFails: Story = {
  args: { detailState: { status: 'error', error: 'Square is unavailable' } },
  play: async () => {
    const canvas = await openDialog();
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Square is unavailable');
  },
};

/** A card bought on the website: who bought it, for whom, and the message. */
export const BoughtOnlineAmount: Story = {
  args: {
    detailState: {
      status: 'success',
      data: {
        card,
        activities: mockGiftCardActivities,
        purchase: {
          giftCardId: card.id,
          last4: card.last4,
          kind: 'amount',
          valueCents: 5000,
          buyerName: 'Robin Ashfield',
          buyerEmail: 'robin@example.com',
          recipientName: 'Olive Thompson',
          recipientEmail: 'olive@example.com',
          message: 'Happy birthday!',
          deliverTo: 'recipient',
          squareOrderId: 'order-1',
          squarePaymentId: 'pay-1',
          createdAt: '2026-11-02T15:00:00.000Z',
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Bought online' }));
    await expect(section.getByText(/Bought by Robin Ashfield \(robin@example\.com\)/)).toBeVisible();
    await expect(section.getByText(/For Olive Thompson \(olive@example\.com\)/)).toBeVisible();
    await expect(section.getByText('Emailed to them')).toBeVisible();
    await expect(section.getByText(/Happy birthday!/)).toBeVisible();
    await expect(section.queryByText(/Class certificate/)).toBeNull();
  },
};

/** A class certificate names the class and its type. */
export const BoughtOnlineClassCertificate: Story = {
  args: {
    detailState: {
      status: 'success',
      data: {
        card,
        activities: mockGiftCardActivities,
        purchase: {
          giftCardId: card.id,
          last4: card.last4,
          kind: 'class',
          valueCents: 6500,
          classId: 'class-1',
          classCategoryId: 'cat-1',
          className: 'Beginner Wheel',
          classCategoryName: 'Pottery',
          buyerName: 'Robin Ashfield',
          buyerEmail: 'robin@example.com',
          recipientName: 'Olive Thompson',
          deliverTo: 'buyer',
          squareOrderId: 'order-1',
          squarePaymentId: 'pay-1',
          createdAt: '2026-11-02T15:00:00.000Z',
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Bought online' }));
    await expect(section.getByText('Class certificate: Beginner Wheel (Pottery)')).toBeVisible();
    await expect(section.getByText('For Olive Thompson')).toBeVisible();
    await expect(section.getByText('Emailed to the buyer to print')).toBeVisible();
  },
};

/** A card sold at the register has no purchase record and no section. */
export const NotBoughtOnline: Story = {
  play: async () => {
    const canvas = await openDialog();
    await expect(canvas.queryByRole('region', { name: 'Bought online' })).toBeNull();
  },
};
