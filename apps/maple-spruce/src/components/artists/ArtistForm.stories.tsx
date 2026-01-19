import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ArtistForm } from './ArtistForm';
import { mockArtist } from '../../../.storybook/fixtures';

const meta = {
  component: ArtistForm,
  title: 'Artists/ArtistForm',
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof ArtistForm>;

export default meta;
type Story = StoryObj<typeof ArtistForm>;

/**
 * Dialog is closed (not visible)
 */
export const Closed: Story = {
  args: {
    open: false,
    isSubmitting: false,
  },
};

/**
 * Create new artist - empty form
 */
export const CreateNew: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
};

/**
 * Edit existing artist - form pre-filled
 */
export const EditExisting: Story = {
  args: {
    open: true,
    artist: mockArtist,
    isSubmitting: false,
  },
};

/**
 * Form is submitting - buttons disabled
 */
export const Submitting: Story = {
  args: {
    open: true,
    artist: mockArtist,
    isSubmitting: true,
  },
};
