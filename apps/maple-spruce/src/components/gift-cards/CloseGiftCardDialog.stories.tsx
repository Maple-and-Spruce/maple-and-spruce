import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { mockGiftCards } from '@maple/react/storybook-fixtures';
import { CloseGiftCardDialog } from './CloseGiftCardDialog';

const body = () => within(document.body);

async function openDialog() {
  const canvas = body();
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible());
  await waitFor(() =>
    expect(getComputedStyle(canvas.getByRole('dialog').parentElement!).opacity).toBe('1')
  );
  return canvas;
}

/** A card bought online with $50 on it. */
const onlineCard = mockGiftCards[0];

const meta = {
  component: CloseGiftCardDialog,
  title: 'Gift Cards/CloseGiftCardDialog',
  parameters: { layout: 'centered' },
  args: {
    card: onlineCard,
    mode: 'refund',
    onClose: fn(),
    onCloseCard: fn(async () => ({
      giftCardId: onlineCard.id,
      mode: 'refund' as const,
      amountCents: 5000,
      refundedCents: 5000,
    })),
    onDone: fn(),
  },
} satisfies Meta<typeof CloseGiftCardDialog>;

export default meta;
type Story = StoryObj<typeof CloseGiftCardDialog>;

/** Refund asks first, in plain words, and nothing happens on Cancel. */
export const ConfirmRefund: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.getByText('Refund and turn off card ending 4821')).toBeVisible();
    await expect(
      canvas.getByText(
        'Refund the $50.00 left on this card to the card that bought it, and turn the gift card off?'
      )
    ).toBeVisible();
    await expect(canvas.getByText(/only what is left is refunded/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onCloseCard).not.toHaveBeenCalled();
  },
};

/** Refunded: says how much went back and that the card no longer works. */
export const Refunded: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Refund $50.00' }));
    await expect(args.onCloseCard).toHaveBeenCalledWith({
      giftCardId: onlineCard.id,
      mode: 'refund',
    });
    await expect(
      await canvas.findByText(
        'Refunded $50.00 to the card that paid for it. The gift card no longer works.'
      )
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Done' }));
    await expect(args.onDone).toHaveBeenCalled();
  },
};

/** Turning off any other card says plainly that no money goes back from here. */
export const ConfirmTurnOff: Story = {
  args: {
    mode: 'deactivate',
    onCloseCard: fn(async () => ({
      giftCardId: onlineCard.id,
      mode: 'deactivate' as const,
      amountCents: 5000,
      refundedCents: 0,
    })),
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.getByText('Turn off card ending 4821')).toBeVisible();
    await expect(canvas.getByText('Turn this card off and take the $50.00 off it?')).toBeVisible();
    await expect(canvas.getByText(/No money goes back to anyone from here/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Turn off card' }));
    await expect(
      await canvas.findByText('Took $50.00 off. The gift card no longer works.')
    ).toBeVisible();
    await expect(args.onCloseCard).toHaveBeenCalledWith({
      giftCardId: onlineCard.id,
      mode: 'deactivate',
    });
  },
};

/** A failure says so without a status code, and offers to try again. */
export const Failed: Story = {
  args: {
    onCloseCard: fn(async () => {
      throw new Error(
        'The $50.00 is off the card, but Square did not make the refund yet. Nothing is lost: try again and it will finish. [400]'
      );
    }),
  },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Refund $50.00' }));
    const alert = await canvas.findByText(/Nothing is lost: try again/);
    await expect(alert).toBeVisible();
    await expect(canvas.queryByText(/\[400\]/)).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Try again' })).toBeEnabled();
  },
};

/** The card turned off but Square's last step lagged: a warning to try again. */
export const RefundedWithWarning: Story = {
  args: {
    onCloseCard: fn(async () => ({
      giftCardId: onlineCard.id,
      mode: 'refund' as const,
      amountCents: 5000,
      refundedCents: 5000,
      warning:
        'The money is handled, but Square did not turn the card off. It holds nothing, so nothing can be spent from it. Try again to turn it off.',
    })),
  },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Refund $50.00' }));
    await expect(await canvas.findByText(/Square did not turn the card off/)).toBeVisible();
  },
};
