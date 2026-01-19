import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ArtistList } from './ArtistList';
import { mockArtists } from '../../../.storybook/fixtures';

const meta = {
  component: ArtistList,
  title: 'Artists/ArtistList',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onEdit: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof ArtistList>;

export default meta;
type Story = StoryObj<typeof ArtistList>;

/**
 * Loading state - shows skeleton cards
 */
export const Loading: Story = {
  args: {
    artistsState: { status: 'loading' },
  },
};

/**
 * Empty state - no artists yet
 */
export const Empty: Story = {
  args: {
    artistsState: { status: 'success', data: [] },
  },
};

/**
 * With artists - shows artist cards
 */
export const WithArtists: Story = {
  args: {
    artistsState: { status: 'success', data: mockArtists },
  },
};

/**
 * Error state - shows error message
 */
export const ErrorState: Story = {
  args: {
    artistsState: { status: 'error', error: 'Failed to load artists' },
  },
};
