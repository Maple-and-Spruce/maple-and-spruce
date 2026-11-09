import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { mockSoldCertificate } from '@maple/react/storybook-fixtures';
import { ReplaceGiftCardDialog } from './ReplaceGiftCardDialog';

const body = () => within(document.body);

async function openDialog() {
  const canvas = body();
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible());
  await waitFor(() =>
    expect(getComputedStyle(canvas.getByRole('dialog').parentElement!).opacity).toBe('1')
  );
  return canvas;
}

const replaced = {
  oldGiftCardId: mockSoldCertificate.id,
  newGiftCardId: 'gftc-replacement-1',
  last4: '3388',
  balanceCents: 5000,
};

const meta = {
  component: ReplaceGiftCardDialog,
  title: 'Gift Cards/ReplaceGiftCardDialog',
  parameters: { layout: 'centered' },
  args: {
    card: mockSoldCertificate,
    onClose: fn(),
    onReplace: fn(async () => replaced),
    onReplaced: fn(),
    // Invented, year 2099, so it can never be a real certificate's code.
    onRevealCode: fn(async () => 'MAPLE2099388'),
    copyToClipboard: fn(async () => undefined),
    makeRequestKey: () => 'replace-story-key',
  },
} satisfies Meta<typeof ReplaceGiftCardDialog>;

export default meta;
type Story = StoryObj<typeof ReplaceGiftCardDialog>;

/** Confirm first: the balance moves and the old card stops working for good. */
export const Confirm: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.getByText('Replace lost card ending 9017')).toBeVisible();
    await expect(canvas.getByText('Move the $50.00 on this card to a new card?')).toBeVisible();
    await expect(canvas.getByText(/The card ending 9017 will stop working for good/)).toBeVisible();
    await expect(args.onReplace).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/** Done: the new card's last 4, its code to copy, and the page refreshes. */
export const Replaced: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Replace card' }));
    await expect(args.onReplace).toHaveBeenCalledWith({
      giftCardId: mockSoldCertificate.id,
      idempotencyKey: 'replace-story-key',
    });
    await expect(
      await canvas.findByText(
        'New card ending 3388 holds $50.00. The card ending 9017 no longer works.'
      )
    ).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Show and copy code' }));
    await expect(await canvas.findByText('MAPLE 2099 388')).toBeVisible();
    await expect(args.onRevealCode).toHaveBeenCalledWith('gftc-replacement-1');

    await userEvent.click(canvas.getByRole('button', { name: 'Done' }));
    await expect(args.onReplaced).toHaveBeenCalledWith(replaced);
  },
};

/** The money moved but Square did not turn the old card off. */
export const ReplacedWithWarning: Story = {
  args: {
    onReplace: fn(async () => ({
      ...replaced,
      warning:
        'The money is on the new card, but Square did not turn the old card off. It holds nothing; try again to turn it off.',
    })),
  },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Replace card' }));
    await expect(await canvas.findByText(/Square did not turn the old card off/)).toBeVisible();
  },
};

/** A failure keeps the dialog and its key, so Try again finishes the same one. */
export const FailsThenRetries: Story = {
  args: {
    // Fails the first time only. A counter, not mockRejectedValueOnce:
    // Storybook resets mocks before each run.
    onReplace: fn(
      (() => {
        let calls = 0;
        return async () => {
          calls += 1;
          if (calls === 1) {
            throw new globalThis.Error(
              'The money came off the old card but Square could not put it on the new one. Try again to finish.'
            );
          }
          return replaced;
        };
      })()
    ),
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Replace card' }));
    await expect(
      await canvas.findByText(/Couldn't replace the card: The money came off the old card/)
    ).toBeVisible();
    await expect(canvas.getByRole('dialog')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(await canvas.findByText(/New card ending 3388/)).toBeVisible();
    await expect(args.onReplace).toHaveBeenNthCalledWith(2, {
      giftCardId: mockSoldCertificate.id,
      idempotencyKey: 'replace-story-key',
    });
  },
};

export const Replacing: Story = {
  args: { onReplace: fn(() => new Promise<never>(() => undefined)) },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Replace card' }));
    await expect(canvas.getByRole('button', { name: 'Replacing…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  },
};
