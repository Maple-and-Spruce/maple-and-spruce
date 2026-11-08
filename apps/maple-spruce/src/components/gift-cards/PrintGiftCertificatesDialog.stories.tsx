import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { mockClassCategories } from '@maple/react/storybook-fixtures';
import type { ClassCategory } from '@maple/ts/domain';
import { PrintGiftCertificatesDialog } from './PrintGiftCertificatesDialog';

const body = () => within(document.body);
const KEY = 'print-story-key-0001';

/** The dialog fades in; wait until it is fully shown before acting on it. */
async function openDialog() {
  const canvas = body();
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible());
  await waitFor(() =>
    expect(getComputedStyle(canvas.getByRole('dialog').parentElement!).opacity).toBe('1')
  );
  return canvas;
}

/** One class type switched on at $85; the others are off. */
const categories: ClassCategory[] = mockClassCategories.map((category, i) =>
  i === 0
    ? { ...category, name: 'Stained Glass', giftCertificateEnabled: true, giftCertificatePriceCents: 8500 }
    : { ...category, giftCertificateEnabled: false }
);

const printed = {
  batchId: 'cert-0a1b2c3d4e5f6071',
  requested: 10,
  valueCents: 2500,
  cards: Array.from({ length: 10 }, (_, i) => ({
    giftCardId: `gftc-stock-${i}`,
    last4: String(5150 + i),
  })),
};

const meta = {
  component: PrintGiftCertificatesDialog,
  title: 'Gift Cards/PrintGiftCertificatesDialog',
  parameters: { layout: 'centered' },
  args: {
    open: true,
    categoriesState: { status: 'success', data: categories },
    onClose: fn(),
    onPrint: fn(async () => printed),
    onPrinted: fn(),
    makeRequestKey: () => KEY,
  },
} satisfies Meta<typeof PrintGiftCertificatesDialog>;

export default meta;
type Story = StoryObj<typeof PrintGiftCertificatesDialog>;

/** Ten $25 certificates: warns they are live, then hands the batch to print. */
export const PrintsAnAmount: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(
      canvas.getByText(
        /These cards are loaded now and spendable as soon as they are printed\. Keep them somewhere safe\./
      )
    ).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Stained glass leaves' })).toBeChecked();

    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount on each' }), '25');
    await userEvent.type(canvas.getByRole('textbox', { name: 'How many' }), '10');
    await userEvent.click(canvas.getByRole('button', { name: 'Make 10 and print' }));

    await waitFor(() =>
      expect(args.onPrint).toHaveBeenCalledWith({
        kind: 'amount',
        amountCents: 2500,
        quantity: 10,
        design: 'stained-glass',
        idempotencyKey: KEY,
      })
    );
    await waitFor(() => expect(args.onPrinted).toHaveBeenCalledWith(printed));
  },
};

/** Only switched-on class types are offered, each with its price. */
export const PrintsAClass: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('radio', { name: 'A class' }));
    await userEvent.click(canvas.getByRole('combobox', { name: /Class type/ }));
    const options = await canvas.findAllByRole('option');
    await expect(options).toHaveLength(1);
    await expect(options[0]).toHaveTextContent('Stained Glass, $85.00');
    await userEvent.click(options[0]);

    await userEvent.type(canvas.getByRole('textbox', { name: 'How many' }), '2');
    await userEvent.click(canvas.getByRole('button', { name: 'Make 2 and print' }));

    await waitFor(() =>
      expect(args.onPrint).toHaveBeenCalledWith({
        kind: 'class',
        classCategoryId: categories[0].id,
        quantity: 2,
        design: 'stained-glass',
        idempotencyKey: KEY,
      })
    );
  },
};

/** Nothing reaches Square until the form is right. */
export const Validation: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount on each' }), '25.50');
    await userEvent.type(canvas.getByRole('textbox', { name: 'How many' }), '60');
    await userEvent.click(canvas.getByRole('button', { name: 'Make 60 and print' }));

    await expect(await canvas.findByText('Enter whole dollars from $5 to $500')).toBeVisible();
    await expect(canvas.getByText('Print from 1 to 50 at a time')).toBeVisible();
    await expect(args.onPrint).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('radio', { name: 'A class' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Make 60 and print' }));
    await expect(await canvas.findByText('Choose a class type')).toBeVisible();
    await expect(args.onPrint).not.toHaveBeenCalled();
  },
};

/** While Square loads the cards the form is locked, so it can't be sent twice. */
export const Loading: Story = {
  args: { onPrint: fn(() => new Promise<never>(() => undefined)) },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount on each' }), '25');
    await userEvent.type(canvas.getByRole('textbox', { name: 'How many' }), '3');
    await userEvent.click(canvas.getByRole('button', { name: 'Make 3 and print' }));

    await expect(await canvas.findByRole('button', { name: 'Loading the cards…' })).toBeDisabled();
    await expect(canvas.getByRole('textbox', { name: 'How many' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  },
};

/** Square made none: says so and lets her try again with the same batch. */
export const Error: Story = {
  args: {
    onPrint: fn(async () => {
      throw new globalThis.Error('Square could not make the certificates, so nothing was loaded. Try again.');
    }),
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount on each' }), '25');
    await userEvent.type(canvas.getByRole('textbox', { name: 'How many' }), '3');
    await userEvent.click(canvas.getByRole('button', { name: 'Make 3 and print' }));

    await expect(await canvas.findByText(/nothing was loaded/)).toBeVisible();
    await expect(args.onPrinted).not.toHaveBeenCalled();
    await expect(canvas.getByRole('textbox', { name: 'How many' })).toBeEnabled();
  },
};

/**
 * Square made some: the batch is fixed, a retry makes only the rest (same
 * key), and the ones already made can be printed straight away.
 */
export const PartialFailure: Story = {
  args: {
    onPrint: fn(async () => ({
      ...printed,
      cards: printed.cards.slice(0, 4),
      error:
        'Square made 4 of 10. Those are loaded and ready to print. Try again to make the rest.',
    })),
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount on each' }), '25');
    await userEvent.type(canvas.getByRole('textbox', { name: 'How many' }), '10');
    await userEvent.click(canvas.getByRole('button', { name: 'Make 10 and print' }));

    await expect(await canvas.findByText(/Square made 4 of 10/)).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'How many' })).toBeDisabled();
    await expect(canvas.getByRole('textbox', { name: 'Amount on each' })).toBeDisabled();
    await expect(args.onPrinted).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('button', { name: 'Try again for the rest' }));
    await waitFor(() => expect(args.onPrint).toHaveBeenCalledTimes(2));
    const [first, second] = (args.onPrint as ReturnType<typeof fn>).mock.calls;
    await expect(second[0]).toEqual(first[0]);

    await userEvent.click(canvas.getByRole('button', { name: 'Print the 4 ready' }));
    await expect(args.onPrinted).toHaveBeenCalledWith(
      expect.objectContaining({ cards: printed.cards.slice(0, 4) })
    );
  },
};

/** No class type switched on yet: says where to do it. */
export const NoClassTypesSwitchedOn: Story = {
  args: {
    categoriesState: {
      status: 'success',
      data: mockClassCategories.map((c) => ({ ...c, giftCertificateEnabled: false })),
    },
  },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(canvas.getByRole('radio', { name: 'A class' }));
    await expect(canvas.getByText(/No class type has gift certificates switched on/)).toBeVisible();
  },
};
