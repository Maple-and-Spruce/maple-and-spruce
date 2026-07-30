import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import type { GetMyWeekResponse } from '@maple/ts/firebase/api-types';
import { MyWeek } from './MyWeek';
import {
  mockMyWeekResponse,
  mockMyWeekStart,
} from '@maple/react/storybook-fixtures';

const meta = {
  component: MyWeek,
  title: 'Lessons/MyWeek',
  parameters: { layout: 'fullscreen' },
  // The category toggle persists to localStorage; clear it so stories don't
  // bleed hidden-category state into each other.
  beforeEach: () => {
    localStorage.removeItem('myWeek.hiddenCategories');
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
      data: { commitments: [], blocks: [], unlinked: true },
    },
  },
};

// Regression: an older deployed getMyWeek (pre-#685) omits `blocks` (and
// `unattributed`). The tab must degrade to an empty week, not white-screen.
export const LegacyResponseMissingBlocks: Story = {
  args: {
    weekState: {
      status: 'success',
      // Intentionally the old shape: no `blocks`, commitments lack
      // `unattributed`. Cast because the current type requires them.
      data: {
        commitments: mockMyWeekResponse.commitments.map((c) => ({
          id: c.id,
          title: c.title,
          category: c.category,
          startDateTime: c.startDateTime,
          endDateTime: c.endDateTime,
          room: c.room,
          ownership: c.ownership,
          cadence: c.cadence,
        })),
        unlinked: false,
      } as unknown as GetMyWeekResponse,
    },
  },
  play: async ({ canvas }) => {
    // Renders the week (nav present) instead of throwing.
    await expect(
      canvas.getByRole('button', { name: /next week/i }),
    ).toBeInTheDocument();
    // Commitments outside a block still render (blocks defaulted to []).
    await waitFor(() =>
      expect(within(document.body).getByText(/Friday Jam/)).toBeInTheDocument(),
    );
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
