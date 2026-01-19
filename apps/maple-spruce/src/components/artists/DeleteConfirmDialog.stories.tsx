import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { mockArtist } from '../../../.storybook/fixtures';

const meta = {
  component: DeleteConfirmDialog,
  title: 'Artists/DeleteConfirmDialog',
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
    artist: mockArtist,
    isDeleting: false,
  },
};

/**
 * Dialog is open with artist to delete
 */
export const Open: Story = {
  args: {
    open: true,
    artist: mockArtist,
    isDeleting: false,
  },
};

/**
 * Dialog showing deletion in progress
 */
export const Deleting: Story = {
  args: {
    open: true,
    artist: mockArtist,
    isDeleting: true,
  },
};

/**
 * Dialog with null artist (edge case)
 */
export const NoArtist: Story = {
  args: {
    open: true,
    artist: null,
    isDeleting: false,
  },
};
