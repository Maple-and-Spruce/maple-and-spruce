import type { Meta, StoryObj } from '@storybook/react';
import { SalesSummaryCards } from './SalesSummaryCards';
import { mockSales } from '../../../.storybook/fixtures';

const meta = {
  component: SalesSummaryCards,
  title: 'Sales/SalesSummaryCards',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SalesSummaryCards>;

export default meta;
type Story = StoryObj<typeof SalesSummaryCards>;

export const WithSales: Story = {
  args: { sales: mockSales },
};

export const NoSales: Story = {
  args: { sales: [] },
};
