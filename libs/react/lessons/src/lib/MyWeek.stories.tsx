import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { MyWeek } from './MyWeek';
import {
  mockMyWeekResponse,
  mockMyWeekStart,
} from '@maple/react/storybook-fixtures';

const meta = {
  component: MyWeek,
  title: 'Lessons/MyWeek',
  parameters: { layout: 'fullscreen' },
  // The category + mode toggles persist to localStorage; clear them so stories
  // don't bleed hidden-category / typical-vs-this state into each other.
  beforeEach: () => {
    localStorage.removeItem('myWeek.hiddenCategories');
    localStorage.removeItem('myWeek.mode');
  },
  args: {
    weekStart: mockMyWeekStart,
    onPrevWeek: fn(),
    onNextWeek: fn(),
    onThisWeek: fn(),
  },
} satisfies Meta<typeof MyWeek>;

export default meta;
type Story = StoryObj<typeof MyWeek>;

export const Populated: Story = {
  args: {
    weekState: { status: 'success', data: mockMyWeekResponse },
  },
};

export const ShowsOtherTeacherBlock: Story = {
  args: { weekState: { status: 'success', data: mockMyWeekResponse } },
  play: async ({ canvas }) => {
    // Another teacher's window renders as a "room taken" band (the shared
    // Spruce Room is unavailable then).
    await waitFor(() =>
      expect(canvas.getByText(/Sam · room taken/)).toBeInTheDocument(),
    );
  },
};

export const Loading: Story = {
  args: { weekState: { status: 'loading' } },
};

export const ErrorState: Story = {
  args: { weekState: { status: 'error', error: 'Network blip.' } },
};

export const Unlinked: Story = {
  args: {
    weekState: {
      status: 'success',
      data: {
        commitments: [],
        standing: [],
        blocks: [],
        otherBlocks: [],
        unlinked: true,
      },
    },
  },
};

export const StepsWeeks: Story = {
  args: { weekState: { status: 'success', data: mockMyWeekResponse } },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /next week/i }));
    await expect(args.onNextWeek).toHaveBeenCalledTimes(1);
    await userEvent.click(
      canvas.getByRole('button', { name: /previous week/i }),
    );
    await expect(args.onPrevWeek).toHaveBeenCalledTimes(1);
  },
};

export const SwitchesToTypicalWeek: Story = {
  args: { weekState: { status: 'success', data: mockMyWeekResponse } },
  play: async ({ canvas }) => {
    const body = within(document.body);
    // In "This week" the concrete week nav is present.
    await expect(
      canvas.getByRole('button', { name: /previous week/i }),
    ).toBeInTheDocument();

    // Flip to "Typical week".
    await userEvent.click(
      canvas.getByRole('button', { name: /typical week/i }),
    );

    // Week navigation is gone (a generic week has no prev/next).
    await waitFor(() =>
      expect(
        canvas.queryByRole('button', { name: /previous week/i }),
      ).not.toBeInTheDocument(),
    );
    // The typical-week caption explains one-offs are hidden…
    await expect(body.getByText(/one-offs are hidden/i)).toBeInTheDocument();
    // …and a standing slot (the Friday jam) still shows.
    await expect(body.getByText(/Friday Jam/)).toBeInTheDocument();
  },
};

export const TogglesCategoryOff: Story = {
  args: { weekState: { status: 'success', data: mockMyWeekResponse } },
  play: async ({ canvas }) => {
    const body = within(document.body);
    // The Friday jam is visible initially.
    await waitFor(() =>
      expect(body.getByText(/Friday Jam/)).toBeInTheDocument(),
    );
    // Toggle the "Jam Session" category chip off.
    await userEvent.click(canvas.getByRole('button', { name: /jam session/i }));
    await waitFor(() =>
      expect(body.queryByText(/Friday Jam/)).not.toBeInTheDocument(),
    );
  },
};
