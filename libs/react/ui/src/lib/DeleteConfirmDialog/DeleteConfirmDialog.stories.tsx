import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within } from 'storybook/test';
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

/**
 * This dialog is reused for actions that are not deletions, and a button saying
 * "Delete" on "Void this invoice?" tells the person the wrong thing about what is
 * about to happen (#106). The verbs are overridable — including the dismiss
 * button, so a dialog whose *action* is a cancellation does not offer two
 * different buttons both called Cancel.
 */
export const BorrowedForSomethingThatIsNotADeletion: Story = {
  args: {
    open: true,
    title: 'Cancel this lesson?',
    itemName: 'Mon, Oct 5, 4:00 PM',
    confirmationMessage:
      'Cancel the lesson on Mon, Oct 5? It stays on the record, marked cancelled.',
    confirmLabel: 'Cancel the lesson',
    busyLabel: 'Cancelling...',
    dismissLabel: 'Back',
  },
  play: async () => {
    const canvas = within(document.body);
    expect(
      await canvas.findByRole('button', { name: 'Cancel the lesson' })
    ).toBeTruthy();
    expect(await canvas.findByRole('button', { name: 'Back' })).toBeTruthy();
    // Nothing on screen says "delete", because nothing is being deleted.
    expect(canvas.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(canvas.queryByText(/want to delete/i)).toBeNull();
  },
};

/** The default is still a deletion, so nothing existing has to opt in. */
export const StillSaysDeleteByDefault: Story = {
  args: { open: true, title: 'Delete this artist?', itemName: 'Elle' },
  play: async () => {
    const canvas = within(document.body);
    expect(await canvas.findByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(await canvas.findByRole('button', { name: 'Cancel' })).toBeTruthy();
  },
};
