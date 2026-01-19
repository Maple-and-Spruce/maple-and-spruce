import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { mockCategoryPottery } from '../../../.storybook/fixtures';

const meta = {
  component: DeleteConfirmDialog,
  title: 'Categories/DeleteConfirmDialog',
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof DeleteConfirmDialog>;

export default meta;
type Story = StoryObj<typeof DeleteConfirmDialog>;

/**
 * Dialog is closed (not visible)
 */
export const Closed: Story = {
  args: {
    open: false,
    category: mockCategoryPottery,
    isDeleting: false,
  },
};

/**
 * Dialog is open with category to delete
 */
export const Open: Story = {
  args: {
    open: true,
    category: mockCategoryPottery,
    isDeleting: false,
  },
};

/**
 * Dialog showing deletion in progress
 */
export const Deleting: Story = {
  args: {
    open: true,
    category: mockCategoryPottery,
    isDeleting: true,
  },
};

/**
 * Dialog with null category (edge case)
 */
export const NoCategory: Story = {
  args: {
    open: true,
    category: null,
    isDeleting: false,
  },
};
