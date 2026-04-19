import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, waitFor } from 'storybook/test';
import { HopeRatesTable } from './HopeRatesTable';

const meta = {
  component: HopeRatesTable,
  title: 'Lessons/HopeRatesTable',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HopeRatesTable>;

export default meta;
type Story = StoryObj<typeof HopeRatesTable>;

export const Default: Story = {};

export const HighlightInitialTier: Story = {
  args: { highlightTier: '30-min-initial' },
};

export const HighlightFullTier: Story = {
  args: { highlightTier: '30-min-full' },
};

export const Highlight45: Story = {
  args: { highlightTier: '45-min' },
};

export const Highlight60: Story = {
  args: { highlightTier: '60-min' },
};

export const HeadingSuppressed: Story = {
  args: { heading: null },
};

export const CustomHeading: Story = {
  args: { heading: 'Current rates' },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

export const AllFourTiersRendered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/30 min \(initial/i)).toBeInTheDocument();
      expect(canvas.getByText(/30 min \(full/i)).toBeInTheDocument();
      expect(canvas.getByText(/^45 min$/i)).toBeInTheDocument();
      expect(canvas.getByText(/^60 min$/i)).toBeInTheDocument();
    });
  },
};

export const DollarAmountsFormattedWithCents: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      // Per-lesson amounts
      expect(canvas.getByText('$32.50')).toBeInTheDocument();
      expect(canvas.getByText('$41.25')).toBeInTheDocument();
      expect(canvas.getByText('$58.75')).toBeInTheDocument();
      expect(canvas.getByText('$75.00')).toBeInTheDocument();
      // Monthly equivalents
      expect(canvas.getByText('$130.00')).toBeInTheDocument();
      expect(canvas.getByText('$165.00')).toBeInTheDocument();
      expect(canvas.getByText('$235.00')).toBeInTheDocument();
      expect(canvas.getByText('$300.00')).toBeInTheDocument();
    });
  },
};

export const HighlightedRowMatchesProp: Story = {
  args: { highlightTier: '45-min' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      // The highlighted row should contain "45 min" and $58.75
      const row = canvas.getByText('$58.75').closest('tr');
      expect(row).not.toBeNull();
      expect(row?.className).toMatch(/Mui-selected/);
    });
  },
};
