import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { mockProduct } from '../../../.storybook/fixtures';

const meta = {
  component: DeleteConfirmDialog,
  title: 'Inventory/DeleteConfirmDialog',
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
    product: mockProduct,
    isDeleting: false,
  },
};

/**
 * Dialog is open with product to delete
 */
export const Open: Story = {
  args: {
    open: true,
    product: mockProduct,
    isDeleting: false,
  },
};

/**
 * Dialog showing deletion in progress
 */
export const Deleting: Story = {
  args: {
    open: true,
    product: mockProduct,
    isDeleting: true,
  },
};

/**
 * Dialog with null product (edge case)
 */
export const NoProduct: Story = {
  args: {
    open: true,
    product: null,
    isDeleting: false,
  },
};
