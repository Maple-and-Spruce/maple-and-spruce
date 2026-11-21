import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { HopeProduct, RequestState } from '@maple/ts/domain';
import { HOPE_STOREFRONT_URL } from '@maple/ts/domain';
import { CopyHopeMessageButton, HopeShareLinks } from './HopeShareLinks';

const NOW = new Date('2026-09-01T12:00:00Z');
const product = (over: Partial<HopeProduct>): HopeProduct => ({
  id: 'p1',
  emaProductId: '103772',
  name: 'Suzuki Violin Lesson - 30 min',
  priceCents: 3000,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const loaded = (data: HopeProduct[]): RequestState<HopeProduct[]> => ({
  status: 'success',
  data,
});

function stubClipboard() {
  const writeText = fn<(text: string) => Promise<void>>(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

const meta = {
  component: HopeShareLinks,
  title: 'Lessons/HopeShareLinks',
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
  },
} satisfies Meta<typeof HopeShareLinks>;

export default meta;
type Story = StoryObj<typeof HopeShareLinks>;

/** The storefront link copies on its own, and opens in a new tab. */
export const CopiesTheStorefrontLink: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = stubClipboard();

    await expect(
      canvas.getByRole('link', { name: HOPE_STOREFRONT_URL })
    ).toHaveAttribute('target', '_blank');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Copy Hope storefront link' })
    );
    await expect(writeText).toHaveBeenCalledWith(HOPE_STOREFRONT_URL);
    await expect(
      await within(document.body).findByText('Link copied')
    ).toBeInTheDocument();
  },
};

/** One message per offered product; retired products are not offered. */
export const CopiesAMessagePerProduct: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = stubClipboard();

    await expect(canvas.queryByText(/Retired Product/)).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Copy message for Old-Time Fiddle Lesson - 30 min',
      })
    );
    const message = writeText.mock.calls[0][0];
    await expect(message).toContain(HOPE_STOREFRONT_URL);
    await expect(message).toContain('"Old-Time Fiddle Lesson - 30 min"');
    await expect(message).toContain('$20.00 per lesson');
  },
};

export const Loading: Story = {
  args: { productsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Loading EMA products')).toBeInTheDocument();
    await expect(canvas.queryByText(/No EMA products/)).not.toBeInTheDocument();
    // The link itself does not depend on the products.
    await expect(
      canvas.getByRole('link', { name: HOPE_STOREFRONT_URL })
    ).toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: { productsState: { status: 'error', error: 'Network down' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Could not load EMA products: Network down')
    ).toBeInTheDocument();
    await expect(canvas.queryByText(/No EMA products/)).not.toBeInTheDocument();
  },
};

export const NoProducts: Story = {
  args: { productsState: loaded([]) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/No EMA products offered yet/)
    ).toBeInTheDocument();
  },
};

/** The student-page button names that student's product. */
export const StudentButton: StoryObj<typeof CopyHopeMessageButton> = {
  render: () => <CopyHopeMessageButton product={product({})} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = stubClipboard();
    await userEvent.click(
      canvas.getByRole('button', { name: /Copy ordering message/ })
    );
    await expect(writeText.mock.calls[0][0]).toContain(
      '"Suzuki Violin Lesson - 30 min"'
    );
  },
};
