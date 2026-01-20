import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ImageUpload, type ImageUploadState } from './ImageUpload';

const meta = {
  component: ImageUpload,
  title: 'UI/ImageUpload',
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    state: {
      control: 'object',
      description: 'Current upload state (discriminated union)',
    },
    existingImageUrl: {
      control: 'text',
      description: 'URL of existing image to display',
    },
    label: {
      control: 'text',
      description: 'Label text above the upload area',
    },
  },
  args: {
    onFileSelected: fn(),
    onRemove: fn(),
  },
} satisfies Meta<typeof ImageUpload>;

export default meta;
type Story = StoryObj<typeof ImageUpload>;

/**
 * Default idle state - shows the drop zone
 */
export const Idle: Story = {
  args: {
    state: { status: 'idle' } as ImageUploadState,
    label: 'Photo',
  },
};

/**
 * With an existing image URL - shows the image with remove button
 */
export const WithExistingImage: Story = {
  args: {
    state: { status: 'idle' } as ImageUploadState,
    existingImageUrl: 'https://picsum.photos/seed/existing/300/300',
    label: 'Photo',
  },
};

/**
 * Previewing a selected file before upload
 */
export const Previewing: Story = {
  args: {
    state: {
      status: 'previewing',
      previewUrl: 'https://picsum.photos/seed/preview/300/300',
      file: new File([''], 'test-image.jpg', { type: 'image/jpeg' }),
    } as ImageUploadState,
    label: 'Photo',
  },
};

/**
 * Upload in progress - shows loading spinner over image
 */
export const Uploading: Story = {
  args: {
    state: {
      status: 'uploading',
      previewUrl: 'https://picsum.photos/seed/uploading/300/300',
    } as ImageUploadState,
    label: 'Photo',
  },
};

/**
 * Upload completed successfully
 */
export const Success: Story = {
  args: {
    state: {
      status: 'success',
      url: 'https://picsum.photos/seed/success/300/300',
    } as ImageUploadState,
    label: 'Photo',
  },
};

/**
 * Upload failed - shows error message
 */
export const ErrorState: Story = {
  args: {
    state: {
      status: 'error',
      error: 'Upload failed: Network error. Please try again.',
      previewUrl: 'https://picsum.photos/seed/error/300/300',
    } as ImageUploadState,
    label: 'Photo',
  },
};

/**
 * User explicitly removed the image
 */
export const Removed: Story = {
  args: {
    state: { status: 'removed' } as ImageUploadState,
    existingImageUrl: 'https://picsum.photos/seed/removed/300/300',
    label: 'Photo',
  },
};

/**
 * Custom label text
 */
export const CustomLabel: Story = {
  args: {
    state: { status: 'idle' } as ImageUploadState,
    label: 'Artist Profile Photo',
  },
};
