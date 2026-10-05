import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, screen, userEvent, within } from 'storybook/test';
import type { HopeProduct, RequestState } from '@maple/ts/domain';
import { HopeProductsCard } from './HopeProductsCard';

const NOW = new Date('2026-09-01T12:00:00Z');
const product = (over: Partial<HopeProduct>): HopeProduct => ({
  id: 'p1',
  emaProductId: '103772',
  name: 'Suzuki Violin Lesson - 30 min',
  priceCents: 3250,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const loaded = (data: HopeProduct[]): RequestState<HopeProduct[]> => ({
  status: 'success',
  data,
});

const meta = {
  component: HopeProductsCard,
  title: 'Lessons/HopeProductsCard',
  parameters: { layout: 'padded' },
  args: {
    productsState: loaded([
      product({}),
      product({
        id: 'p2',
        emaProductId: '103774',
        name: 'Old-Time Fiddle Lesson - 30 min',
        priceCents: 2000,
      }),
      product({
        id: 'p3',
        emaProductId: '99999',
        name: 'Retired Product',
        priceCents: 5000,
        active: false,
      }),
    ]),
    onSave: fn(async () => undefined),
  },
} satisfies Meta<typeof HopeProductsCard>;

export default meta;
type Story = StoryObj<typeof HopeProductsCard>;

/** Mirrors the portal's columns so the two can be checked side by side. */
export const MirrorsThePortal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('103772')).toBeInTheDocument();
    await expect(canvas.getByText('Suzuki Violin Lesson - 30 min')).toBeInTheDocument();
    await expect(canvas.getByText('$32.50')).toBeInTheDocument();
    await expect(canvas.getByText('Retired')).toBeInTheDocument();
  },
};

/** Adding a product as it reads in the portal sends cents. */
export const AddingAProduct: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add product' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('EMA product ID'), '137571');
    await userEvent.type(
      dialog.getByLabelText('Name'),
      'Standard Child Guitar Lesson 30 minutes'
    );
    await userEvent.type(dialog.getByLabelText('Price per lesson'), '30');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await expect(args.onSave).toHaveBeenCalledWith({
      id: undefined,
      emaProductId: '137571',
      name: 'Standard Child Guitar Lesson 30 minutes',
      priceCents: 3000,
      active: true,
    });
  },
};

/** Editing keeps the id, so it changes that product rather than adding one. */
export const EditingAPrice: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit Old-Time Fiddle Lesson - 30 min' })
    );
    const dialog = within(await screen.findByRole('dialog'));
    const price = dialog.getByLabelText('Price per lesson');
    await userEvent.clear(price);
    await userEvent.type(price, '22.50');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p2', priceCents: 2250 })
    );
  },
};

/** A blank or zero price is refused before anything is sent. */
export const AZeroPriceIsRefused: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add product' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('EMA product ID'), '1');
    await userEvent.type(dialog.getByLabelText('Name'), 'Something');
    await userEvent.type(dialog.getByLabelText('Price per lesson'), '0');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await expect(
      await dialog.findByText('Price must be more than $0')
    ).toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** Loading is not "no products". */
export const Loading: Story = {
  args: { productsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Loading EMA products')).toBeInTheDocument();
    await expect(canvas.queryByText(/No EMA products yet/)).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Add product' })).toBeDisabled();
  },
};

export const Empty: Story = {
  args: { productsState: loaded([]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/No EMA products yet/)).toBeInTheDocument();
  },
};

export const ErrorState: Story = {
  args: { productsState: { status: 'error', error: 'offline' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Could not load EMA products: offline')
    ).toBeInTheDocument();
  },
};
