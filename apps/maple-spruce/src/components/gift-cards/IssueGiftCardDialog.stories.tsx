import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { mockClassCategories, mockGiftCardCode } from '@maple/react/storybook-fixtures';
import { IssueGiftCardDialog } from './IssueGiftCardDialog';

const body = () => within(document.body);
const KEY = 'issue-story-key-0001';

/** The dialog fades in; wait until it is fully shown before acting on it. */
async function openDialog() {
  const canvas = body();
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible());
  await waitFor(() =>
    expect(getComputedStyle(canvas.getByRole('dialog').parentElement!).opacity).toBe('1')
  );
  return canvas;
}

const issued = {
  giftCardId: 'gftc-free-1',
  last4: '0042',
  kind: 'amount' as const,
  valueCents: 2500,
  recorded: true,
};

const meta = {
  component: IssueGiftCardDialog,
  title: 'Gift Cards/IssueGiftCardDialog',
  parameters: { layout: 'centered' },
  args: {
    open: true,
    categoriesState: { status: 'success', data: mockClassCategories },
    onClose: fn(),
    onIssue: fn(async () => issued),
    onIssued: fn(),
    onRevealCode: fn(async () => mockGiftCardCode),
    copyToClipboard: fn(async () => undefined),
    makeRequestKey: () => KEY,
  },
} satisfies Meta<typeof IssueGiftCardDialog>;

export default meta;
type Story = StoryObj<typeof IssueGiftCardDialog>;

/** A $25 raffle prize: says plainly it is free, then offers the code. */
export const GivesAnAmount: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.getByText(/This card is free\. Nobody pays for it/)).toBeVisible();

    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount' }), '25');
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Why is the studio giving it?' }),
      'Raffle prize at the fall fair'
    );
    await userEvent.type(canvas.getByRole('textbox', { name: 'To (optional)' }), 'Olive Thompson');
    await userEvent.type(canvas.getByRole('textbox', { name: 'From (optional)' }), 'Maple & Spruce');
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));

    await waitFor(() =>
      expect(args.onIssue).toHaveBeenCalledWith({
        kind: 'amount',
        amountCents: 2500,
        reason: 'Raffle prize at the fall fair',
        recipientName: 'Olive Thompson',
        fromName: 'Maple & Spruce',
        message: undefined,
        idempotencyKey: KEY,
      })
    );
    await expect(await canvas.findByText('Gift card ending 0042 is ready')).toBeVisible();
    await expect(canvas.getByText(/\$25\.00 is on it/)).toBeVisible();
    await expect(args.onIssued).toHaveBeenCalledWith(issued);

    await userEvent.click(canvas.getByRole('button', { name: 'Show and copy code' }));
    await expect(await canvas.findByTestId('gift-card-code')).toHaveTextContent(
      '7783 3200 0000 4821'
    );
    await expect(args.onRevealCode).toHaveBeenCalledWith('gftc-free-1');
    await expect(args.copyToClipboard).toHaveBeenCalledWith(mockGiftCardCode);
  },
};

/** A class certificate: pick the class type, enter what goes on the card. */
export const GivesAClass: Story = {
  args: {
    onIssue: fn(async () => ({
      ...issued,
      kind: 'class' as const,
      valueCents: 6500,
      className: 'Pottery & Ceramics',
    })),
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('radio', { name: 'A class' }));
    await userEvent.click(canvas.getByRole('combobox', { name: /Class type/ }));
    await userEvent.click(await canvas.findByRole('option', { name: 'Pottery & Ceramics' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Value of the class' }), '65');
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Why is the studio giving it?' }),
      'Instructor thank-you'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));

    await waitFor(() =>
      expect(args.onIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'class',
          classCategoryId: 'cat-pottery',
          valueCents: 6500,
          reason: 'Instructor thank-you',
        })
      )
    );
    await expect(
      await canvas.findByText(/as a class certificate for Pottery & Ceramics/)
    ).toBeVisible();
  },
};

/** Nothing is sent until the amount and the reason are right. */
export const Validation: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));
    await expect(await canvas.findByText('Enter whole dollars from $5 to $500')).toBeVisible();
    await expect(canvas.getByText('Say why the studio is giving this card')).toBeVisible();

    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount' }), '600');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Why is the studio giving it?' }), 'ok');
    await expect(canvas.getByText('Enter whole dollars from $5 to $500')).toBeVisible();
    await expect(canvas.getByText('Use at least 3 characters')).toBeVisible();

    await userEvent.click(canvas.getByRole('radio', { name: 'A class' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));
    await expect(await canvas.findByText('Choose a class type')).toBeVisible();
    await expect(args.onIssue).not.toHaveBeenCalled();
  },
};

/** A code the studio chooses: a bad one is caught before anything is sent. */
export const CustomCode: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount' }), '5');
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Why is the studio giving it?' }),
      'Register test of a word code'
    );
    const code = canvas.getByRole('textbox', { name: 'Custom code (optional)' });

    await userEvent.type(code, '4111 1111');
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));
    await expect(
      await canvas.findByText('A number-only code cannot start with 2, 3, 4, 5 or 6')
    ).toBeVisible();
    await expect(args.onIssue).not.toHaveBeenCalled();

    await userEvent.clear(code);
    await userEvent.type(code, 'FERN REEL HARP 4821');
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));
    await waitFor(() =>
      expect(args.onIssue).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 500, code: 'FERN REEL HARP 4821' })
      )
    );
  },
};

/** Square refused: the form stays filled in, with the reason shown. */
export const ServerError: Story = {
  args: {
    onIssue: fn(async () => {
      throw new Error('Square could not make the gift card. Nothing was given; try again.');
    }),
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount' }), '25');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Why is the studio giving it?' }), 'Raffle prize');
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));

    await waitFor(() =>
      expect(canvas.getByText(/Couldn.t make the gift card: .*Nothing was given/)).toBeVisible()
    );
    await expect(canvas.getByRole('textbox', { name: 'Amount' })).toHaveValue('25');
    await expect(args.onIssued).not.toHaveBeenCalled();
  },
};

/** While Square makes the card, the form is locked so it can't be sent twice. */
export const Making: Story = {
  args: { onIssue: fn(() => new Promise<never>(() => undefined)) },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount' }), '25');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Why is the studio giving it?' }), 'Raffle prize');
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));
    await expect(await canvas.findByRole('button', { name: 'Making the card…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expect(canvas.getByRole('textbox', { name: 'Amount' })).toBeDisabled();
  },
};

/** The card works but our note of it was not saved: say so. */
export const NotRecorded: Story = {
  args: { onIssue: fn(async () => ({ ...issued, recorded: false })) },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount' }), '25');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Why is the studio giving it?' }), 'Raffle prize');
    await userEvent.click(canvas.getByRole('button', { name: 'Give gift card' }));
    await expect(await canvas.findByText(/could not be saved/)).toBeVisible();
  },
};

/** While the class types load, the picker is a skeleton, never "no class types". */
export const ClassTypesLoading: Story = {
  args: { categoriesState: { status: 'loading' } },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('radio', { name: 'A class' }));
    await expect(await canvas.findByLabelText('Loading class types')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByText(/no class types yet/)).toBeNull();
  },
};

export const ClassTypesFailed: Story = {
  args: { categoriesState: { status: 'error', error: 'Network down' } },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('radio', { name: 'A class' }));
    await expect(await canvas.findByText(/Couldn.t load the class types: Network down/)).toBeVisible();
  },
};

export const NoClassTypes: Story = {
  args: { categoriesState: { status: 'success', data: [] } },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('radio', { name: 'A class' }));
    await expect(await canvas.findByText(/There are no class types yet/)).toBeVisible();
  },
};
