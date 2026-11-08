import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { mockClassCategories, mockGiftCards } from '@maple/react/storybook-fixtures';
import { MarkClassCertificateDialog } from './MarkClassCertificateDialog';

const card = mockGiftCards[0];
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

const saved = {
  purchase: {
    giftCardId: card.id,
    last4: card.last4,
    kind: 'class' as const,
    valueCents: 6500,
    source: 'register' as const,
    classCategoryId: 'cat-pottery',
    className: 'Pottery & Ceramics',
    classCategoryName: 'Pottery & Ceramics',
    createdAt: '2026-11-08T12:00:00.000Z',
  },
};

const meta = {
  component: MarkClassCertificateDialog,
  title: 'Gift Cards/MarkClassCertificateDialog',
  parameters: { layout: 'centered' },
  args: {
    card,
    categoriesState: { status: 'success', data: mockClassCategories },
    onClose: fn(),
    onSubmit: fn(async () => saved),
    onDone: fn(),
  },
} satisfies Meta<typeof MarkClassCertificateDialog>;

export default meta;
type Story = StoryObj<typeof MarkClassCertificateDialog>;

/** Choose the class type, add who it is for, save. Nothing changes in Square. */
export const MarksIt: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.getByText('Make card ending 4821 a class certificate')).toBeVisible();
    await expect(canvas.getByText(/Nothing changes in Square/)).toBeVisible();

    await userEvent.click(canvas.getByRole('combobox', { name: /Class type/ }));
    await userEvent.click(await canvas.findByRole('option', { name: 'Pottery & Ceramics' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'To (optional)' }), 'Olive Thompson');
    await userEvent.click(canvas.getByRole('button', { name: 'Make it a class certificate' }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        giftCardId: card.id,
        classCategoryId: 'cat-pottery',
        recipientName: 'Olive Thompson',
        fromName: undefined,
        message: undefined,
      })
    );
    await waitFor(() => expect(args.onDone).toHaveBeenCalledWith(saved));
  },
};

export const NeedsAClassType: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('button', { name: 'Make it a class certificate' }));
    await expect(await canvas.findByText('Choose a class type')).toBeVisible();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** A card that already has a record is refused, and the dialog says what it is. */
export const AlreadyRecorded: Story = {
  args: {
    onSubmit: fn(async () => {
      throw new Error('This card was bought online as a $50 gift card. It can’t be changed.');
    }),
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('combobox', { name: /Class type/ }));
    await userEvent.click(await canvas.findByRole('option', { name: 'Fiber Arts' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Make it a class certificate' }));
    await expect(
      await canvas.findByText(/Couldn.t make it a class certificate: .*bought online as a \$50/)
    ).toBeVisible();
    await expect(args.onDone).not.toHaveBeenCalled();
  },
};

export const Saving: Story = {
  args: { onSubmit: fn(() => new Promise<never>(() => undefined)) },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('combobox', { name: /Class type/ }));
    await userEvent.click(await canvas.findByRole('option', { name: 'Fiber Arts' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Make it a class certificate' }));
    await expect(await canvas.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  },
};

/** While the class types load, the picker is a skeleton, never "no class types". */
export const ClassTypesLoading: Story = {
  args: { categoriesState: { status: 'loading' } },
  play: async () => {
    const canvas = await openDialog();
    await expect(await canvas.findByLabelText('Loading class types')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByText(/no class types yet/)).toBeNull();
  },
};
