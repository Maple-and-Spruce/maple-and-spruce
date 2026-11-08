import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { mockClassCategory2 } from '@maple/react/storybook-fixtures';
import { ClassCategoryForm } from './ClassCategoryForm';

/**
 * The Class Categories add/edit dialog. These stories cover the gift
 * certificate switch (#309): a class type is sold on the gift card page only
 * while it is on, at the certificate price.
 */
const meta = {
  component: ClassCategoryForm,
  title: 'Class Categories/ClassCategoryForm',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    open: true,
    onClose: fn(),
    onSubmit: fn(async () => undefined),
    nextOrder: 30,
  },
} satisfies Meta<typeof ClassCategoryForm>;
export default meta;
type Story = StoryObj<typeof ClassCategoryForm>;

/** The dialog renders in a portal and fades in: wait for it to be opaque. */
async function openDialog() {
  const canvas = within(document.body);
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible());
  await waitFor(() =>
    expect(getComputedStyle(canvas.getByRole('dialog').parentElement!).opacity).toBe('1')
  );
  return canvas;
}

/** New types start switched off, with no price field. */
export const NewTypeIsOff: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    const toggle = canvas.getByRole('switch', { name: 'Sell as a gift certificate' });
    await expect(toggle).not.toBeChecked();
    await expect(canvas.queryByLabelText(/Certificate price/)).toBeNull();

    await userEvent.type(canvas.getByLabelText(/Category Name/), 'Weaving');
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Weaving', giftCertificateEnabled: false, order: 30 })
      )
    );
  },
};

/** Switching it on asks for a price, and saves both. */
export const SwitchOnWithPrice: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByLabelText(/Category Name/), 'Weaving');
    await userEvent.click(canvas.getByRole('switch', { name: 'Sell as a gift certificate' }));

    // No price yet: refused, with the reason.
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
    await expect(
      await canvas.findByText('Enter a certificate price to sell this type as a gift certificate')
    ).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();

    await userEvent.type(canvas.getByLabelText(/Certificate price/), '45');
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Weaving',
          giftCertificateEnabled: true,
          giftCertificatePriceCents: 4500,
        })
      )
    );
  },
};

/** A zero price is refused. */
export const RefusesZeroPrice: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.type(canvas.getByLabelText(/Category Name/), 'Weaving');
    await userEvent.click(canvas.getByRole('switch', { name: 'Sell as a gift certificate' }));
    await userEvent.type(canvas.getByLabelText(/Certificate price/), '0');
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
    await expect(
      await canvas.findByText('The certificate price must be more than $0')
    ).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** Editing a type that is on shows its price; switching off keeps the price. */
export const EditSwitchedOnType: Story = {
  args: {
    category: {
      ...mockClassCategory2,
      giftCertificateEnabled: true,
      giftCertificatePriceCents: 6500,
    },
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    const toggle = canvas.getByRole('switch', { name: 'Sell as a gift certificate' });
    await expect(toggle).toBeChecked();
    await expect(canvas.getByLabelText(/Certificate price/)).toHaveValue('65');

    await userEvent.click(toggle);
    await expect(canvas.queryByLabelText(/Certificate price/)).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Update' }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ giftCertificateEnabled: false, giftCertificatePriceCents: 6500 })
      )
    );
  },
};
