import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { RecordSaleDialog } from './RecordSaleDialog';
import { mockProducts } from '@maple/react/storybook-fixtures';

const meta = {
  component: RecordSaleDialog,
  title: 'Sales/RecordSaleDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    onClose: fn(),
    onSubmit: fn().mockResolvedValue(undefined),
    products: mockProducts,
  },
} satisfies Meta<typeof RecordSaleDialog>;

export default meta;
type Story = StoryObj<typeof RecordSaleDialog>;

export const Closed: Story = { args: { open: false } };
export const Open: Story = { args: { open: true } };
export const Submitting: Story = {
  args: { open: true, isSubmitting: true },
};
