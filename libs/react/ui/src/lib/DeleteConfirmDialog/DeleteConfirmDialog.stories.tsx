import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { Alert, Typography } from '@mui/material';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

const meta = {
  component: DeleteConfirmDialog,
  title: 'UI/DeleteConfirmDialog',
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    title: {
      control: 'text',
      description: 'Dialog title',
    },
    itemName: {
      control: 'text',
      description: 'Name of the item being deleted',
    },
    isDeleting: {
      control: 'boolean',
      description: 'Whether a delete operation is in progress',
    },
    confirmationMessage: {
      control: 'text',
      description: 'Custom confirmation message',
    },
  },
  args: {
    open: true,
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof DeleteConfirmDialog>;

export default meta;
type Story = StoryObj<typeof DeleteConfirmDialog>;

/**
 * Basic delete confirmation for a product
 */
export const Product: Story = {
  args: {
    title: 'Delete Product?',
    itemName: 'Handwoven Scarf - Forest Green',
  },
};

/**
 * Delete confirmation for an artist with a warning
 */
export const ArtistWithWarning: Story = {
  args: {
    title: 'Delete Artist?',
    itemName: 'Sarah Mitchell',
    warningContent: (
      <Alert severity="warning">
        Consider setting the artist to "inactive" instead to preserve historical
        sales records. Deleting cannot be undone.
      </Alert>
    ),
  },
};

/**
 * Delete confirmation for a category with dependency warning
 */
export const CategoryWithDependencyWarning: Story = {
  args: {
    title: 'Delete Category?',
    itemName: 'Pottery',
    warningContent: (
      <Typography sx={{ mt: 1, color: 'warning.main' }}>
        Note: This will fail if any products are using this category. You must
        reassign those products first.
      </Typography>
    ),
  },
};

/**
 * Delete in progress state
 */
export const Deleting: Story = {
  args: {
    title: 'Delete Product?',
    itemName: 'Ceramic Mug Set',
    isDeleting: true,
  },
};

/**
 * Custom confirmation message
 */
export const CustomMessage: Story = {
  args: {
    title: 'Remove Item?',
    itemName: 'Draft Order #1234',
    confirmationMessage:
      'This will permanently remove the draft order. Any items in the order will be returned to inventory.',
  },
};
