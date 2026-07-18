import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import { ProductEtsySection } from './ProductEtsySection';
import { mockProduct } from '@maple/react/storybook-fixtures';

const listedProduct = { ...mockProduct, etsyListingId: '1234567890' };

const meta = {
  component: ProductEtsySection,
  title: 'Inventory/ProductEtsySection',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <Box sx={{ width: 480, p: 2 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof ProductEtsySection>;

export default meta;
type Story = StoryObj<typeof ProductEtsySection>;

export const NotListed: Story = {
  args: { product: mockProduct },
};

export const Listed: Story = {
  args: { product: listedProduct },
};
