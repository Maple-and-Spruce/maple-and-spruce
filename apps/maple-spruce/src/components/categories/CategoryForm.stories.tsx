import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { CategoryForm } from './CategoryForm';
import { mockCategoryPottery } from '../../../.storybook/fixtures';

const meta = {
  component: CategoryForm,
  title: 'Categories/CategoryForm',
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof CategoryForm>;

export default meta;
type Story = StoryObj<typeof CategoryForm>;

/**
 * Dialog is closed (not visible)
 */
export const Closed: Story = {
  args: {
    open: false,
    isSubmitting: false,
    nextOrder: 1,
  },
};

/**
 * Create new category - empty form
 */
export const CreateNew: Story = {
  args: {
    open: true,
    isSubmitting: false,
    nextOrder: 6,
  },
};

/**
 * Edit existing category - form pre-filled
 */
export const EditExisting: Story = {
  args: {
    open: true,
    category: mockCategoryPottery,
    isSubmitting: false,
  },
};

/**
 * Form is submitting - buttons disabled
 */
export const Submitting: Story = {
  args: {
    open: true,
    category: mockCategoryPottery,
    isSubmitting: true,
  },
};
