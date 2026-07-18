import type { Meta, StoryObj } from '@storybook/react';
import type { Artist, Product } from '@maple/ts/domain';
import { SalesDataTable } from './SalesDataTable';
import {
  mockSales,
  mockArtists,
  mockProducts,
} from '@maple/react/storybook-fixtures';

const artistMap = new Map<string, Artist>(mockArtists.map((a) => [a.id, a]));
const productMap = new Map<string, Product>(
  mockProducts.map((p) => [p.id, p])
);

const meta = {
  component: SalesDataTable,
  title: 'Sales/SalesDataTable',
  parameters: { layout: 'fullscreen' },
  args: { artistMap, productMap },
} satisfies Meta<typeof SalesDataTable>;

export default meta;
type Story = StoryObj<typeof SalesDataTable>;

export const WithSales: Story = {
  args: { salesState: { status: 'success', data: mockSales } },
};

export const Empty: Story = {
  args: { salesState: { status: 'success', data: [] } },
};

export const Loading: Story = {
  args: { salesState: { status: 'loading' } },
};

export const ErrorState: Story = {
  args: {
    salesState: { status: 'error', error: 'Failed to load sales' },
  },
};
