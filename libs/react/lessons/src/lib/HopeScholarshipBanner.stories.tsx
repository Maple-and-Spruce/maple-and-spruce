import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { HopeScholarshipBanner } from './HopeScholarshipBanner';

const meta = {
  component: HopeScholarshipBanner,
  title: 'Lessons/HopeScholarshipBanner',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HopeScholarshipBanner>;

export default meta;
type Story = StoryObj<typeof HopeScholarshipBanner>;

// ============================================================
// VISUAL STATES
// ============================================================

export const WithInitialTier: Story = {
  args: { registeredLessonLength: '30-min-initial' },
};

export const WithFullTier: Story = {
  args: { registeredLessonLength: '30-min-full' },
};

export const With45Min: Story = {
  args: { registeredLessonLength: '45-min' },
};

export const With60Min: Story = {
  args: { registeredLessonLength: '60-min' },
};

export const WithoutTier: Story = {
  args: {},
};

export const RatesExpandedByDefault: Story = {
  args: {
    registeredLessonLength: '45-min',
    defaultRatesExpanded: true,
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

export const BillingRulesAreRendered: Story = {
  args: { registeredLessonLength: '30-min-initial' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/Hope Scholarship/i)).toBeInTheDocument();
      expect(canvas.getByText(/per lesson after it is rendered/i)).toBeInTheDocument();
      expect(
        canvas.getByText(/cannot be retained for services not rendered/i)
      ).toBeInTheDocument();
      expect(
        canvas.getByText(/credit back to the Hope account/i)
      ).toBeInTheDocument();
    });
  },
};

export const CurrentRateChipShowsPerLessonAmount: Story = {
  args: { registeredLessonLength: '45-min' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(
        canvas.getByText(/Current rate: \$58\.75 \/ lesson/i)
      ).toBeInTheDocument();
      expect(canvas.getByText(/Monthly equiv: \$235\.00/i)).toBeInTheDocument();
    });
  },
};

export const NoRateChipWhenTierNotSet: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/Hope Scholarship/i)).toBeInTheDocument();
    });
    expect(canvas.queryByText(/Current rate:/i)).toBeNull();
  },
};

export const ExpandRatesShowsTable: Story = {
  args: { registeredLessonLength: '30-min-full' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Table should not be visible initially
    expect(canvas.queryByRole('table')).toBeNull();

    const toggle = canvas.getByRole('button', { name: /view all rates/i });
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(canvas.getByRole('table')).toBeInTheDocument();
      // Button label flips
      expect(
        canvas.getByRole('button', { name: /hide all rates/i })
      ).toBeInTheDocument();
    });
  },
};

export const ExpandedTableHighlightsCurrentTier: Story = {
  args: {
    registeredLessonLength: '60-min',
    defaultRatesExpanded: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      // Row containing $75.00 (60-min rate) should be highlighted
      const row = canvas.getByText('$75.00').closest('tr');
      expect(row?.className).toMatch(/Mui-selected/);
    });
  },
};
