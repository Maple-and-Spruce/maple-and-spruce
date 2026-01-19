import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ProductForm } from './ProductForm';
import {
  mockProduct,
  mockArtists,
  mockCategories,
} from '../../../.storybook/fixtures';

const meta = {
  component: ProductForm,
  title: 'Inventory/ProductForm',
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
    artists: mockArtists,
    categories: mockCategories,
  },
} satisfies Meta<typeof ProductForm>;

export default meta;
type Story = StoryObj<typeof ProductForm>;

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
 * Create new product - empty form
 */
export const CreateNew: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
};

/**
 * Edit existing product - form pre-filled
 */
export const EditExisting: Story = {
  args: {
    open: true,
    product: mockProduct,
    isSubmitting: false,
  },
};

/**
 * Form is submitting - buttons disabled
 */
export const Submitting: Story = {
  args: {
    open: true,
    product: mockProduct,
    isSubmitting: true,
  },
};
