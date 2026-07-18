import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
  SalesFilterToolbar,
  defaultSalesFilters,
  type SalesFilters,
} from './SalesFilterToolbar';
import { mockArtists } from '@maple/react/storybook-fixtures';

const meta = {
  component: SalesFilterToolbar,
  title: 'Sales/SalesFilterToolbar',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SalesFilterToolbar>;

export default meta;
type Story = StoryObj<typeof SalesFilterToolbar>;

function StatefulWrapper({
  initial,
}: {
  initial: SalesFilters;
}) {
  const [filters, setFilters] = useState<SalesFilters>(initial);
  return (
    <SalesFilterToolbar
      filters={filters}
      onFiltersChange={setFilters}
      artists={mockArtists}
      totalCount={42}
    />
  );
}

export const Default: Story = {
  render: () => <StatefulWrapper initial={defaultSalesFilters} />,
};

export const Filtered: Story = {
  render: () => (
    <StatefulWrapper
      initial={{
        from: '2024-10-01',
        to: '2024-10-31',
        artistId: mockArtists[0]?.id ?? '',
        source: 'etsy',
      }}
    />
  ),
};
