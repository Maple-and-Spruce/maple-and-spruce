import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ProductDataTable } from './ProductDataTable';
import {
  mockProducts,
  mockActiveProducts,
  mockArtists,
  mockCategories,
} from '../../../.storybook/fixtures';
import type { Artist } from '@maple/ts/domain';
import type { Category } from '@maple/ts/domain';

// Create maps from arrays
const artistMap = new Map<string, Artist>(mockArtists.map((a) => [a.id, a]));
const categoryMap = new Map<string, Category>(mockCategories.map((c) => [c.id, c]));

const meta = {
  component: ProductDataTable,
  title: 'Inventory/ProductDataTable',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onEdit: fn(),
    onDelete: fn(),
    artistMap,
    categoryMap,
  },
} satisfies Meta<typeof ProductDataTable>;

export default meta;
type Story = StoryObj<typeof ProductDataTable>;

/**
 * Loading state - shows skeleton table
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
 * With products - shows product data grid
 */
export const WithProducts: Story = {
  args: {
    productsState: { status: 'success', data: mockProducts },
  },
};

/**
 * Filtered products - showing subset via filteredProducts prop
 */
export const FilteredProducts: Story = {
  args: {
    productsState: { status: 'success', data: mockProducts },
    filteredProducts: mockActiveProducts,
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
