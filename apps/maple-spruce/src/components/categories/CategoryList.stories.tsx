import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { CategoryList } from './CategoryList';
import { mockCategories } from '../../../.storybook/fixtures';

const meta = {
  component: CategoryList,
  title: 'Categories/CategoryList',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onEdit: fn(),
    onDelete: fn(),
    onReorder: fn(),
  },
} satisfies Meta<typeof CategoryList>;

export default meta;
type Story = StoryObj<typeof CategoryList>;

/**
 * Loading state - shows skeleton table
 */
export const Loading: Story = {
  args: {
    categoriesState: { status: 'loading' },
  },
};

/**
 * Empty state - no categories yet
 */
export const Empty: Story = {
  args: {
    categoriesState: { status: 'success', data: [] },
  },
};

/**
 * With categories - shows category table with drag handles
 */
export const WithCategories: Story = {
  args: {
    categoriesState: { status: 'success', data: mockCategories },
  },
};

/**
 * Error state - shows error message
 */
export const ErrorState: Story = {
  args: {
    categoriesState: { status: 'error', error: 'Failed to load categories' },
  },
};
