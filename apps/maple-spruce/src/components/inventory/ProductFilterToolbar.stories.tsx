import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ProductFilterToolbar, defaultFilters } from './ProductFilterToolbar';
import { mockArtists, mockCategories } from '../../../.storybook/fixtures';

const meta = {
  component: ProductFilterToolbar,
  title: 'Inventory/ProductFilterToolbar',
  parameters: {
    layout: 'padded',
  },
  args: {
    onFiltersChange: fn(),
    artists: mockArtists,
    categories: mockCategories,
  },
} satisfies Meta<typeof ProductFilterToolbar>;

export default meta;
type Story = StoryObj<typeof ProductFilterToolbar>;

/**
 * Default state - no filters applied
 */
export const Default: Story = {
  args: {
    filters: defaultFilters,
    totalCount: 25,
    filteredCount: 25,
  },
};

/**
 * With search filter applied
 */
export const WithSearchFilter: Story = {
  args: {
    filters: {
      ...defaultFilters,
      search: 'ceramic',
    },
    totalCount: 25,
    filteredCount: 5,
  },
};

/**
 * With category filter applied
 */
export const WithCategoryFilter: Story = {
  args: {
    filters: {
      ...defaultFilters,
      categoryIds: ['cat-001'],
    },
    totalCount: 25,
    filteredCount: 8,
  },
};

/**
 * With multiple filters applied
 */
export const WithMultipleFilters: Story = {
  args: {
    filters: {
      search: 'vase',
      categoryIds: ['cat-001'],
      artistIds: ['artist-001'],
      statuses: ['active'],
      inStockOnly: true,
    },
    totalCount: 25,
    filteredCount: 2,
  },
};

/**
 * Empty results after filtering
 */
export const NoResults: Story = {
  args: {
    filters: {
      ...defaultFilters,
      search: 'nonexistent product',
    },
    totalCount: 25,
    filteredCount: 0,
  },
};
