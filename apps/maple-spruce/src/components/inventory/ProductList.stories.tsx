import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ProductList } from './ProductList';
import { mockProducts, mockArtists } from '../../../.storybook/fixtures';
import type { Artist } from '@maple/ts/domain';

// Create map from array
const artistMap = new Map<string, Artist>(mockArtists.map((a) => [a.id, a]));

const meta = {
  component: ProductList,
  title: 'Inventory/ProductList',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onEdit: fn(),
    onDelete: fn(),
    artistMap,
  },
} satisfies Meta<typeof ProductList>;

export default meta;
type Story = StoryObj<typeof ProductList>;

/**
 * Loading state - shows skeleton cards
 */
export const Loading: Story = {
  args: {
    productsState: { status: 'loading' },
  },
};

/**
 * Empty state - no products yet
 */
export const Empty: Story = {
  args: {
    productsState: { status: 'success', data: [] },
  },
};

/**
 * With products - shows product cards
 */
export const WithProducts: Story = {
  args: {
    productsState: { status: 'success', data: mockProducts },
  },
};

/**
 * Error state - shows error message
 */
export const ErrorState: Story = {
  args: {
    productsState: { status: 'error', error: 'Failed to load products' },
  },
};
