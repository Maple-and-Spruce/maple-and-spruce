import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor, within } from 'storybook/test';
import { MyOpenings } from './MyOpenings';
import { mockMyWeekResponse } from '@maple/react/storybook-fixtures';
import type { GetMyWeekResponse } from '@maple/ts/firebase/api-types';

const meta = {
  component: MyOpenings,
  title: 'Lessons/MyOpenings',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MyOpenings>;

export default meta;
type Story = StoryObj<typeof MyOpenings>;

export const Populated: Story = {
  args: { weekState: { status: 'success', data: mockMyWeekResponse } },
  play: async ({ canvas }) => {
    // The Tuesday block (3–6 PM) minus the recurring 3:00–3:30 lesson leaves
    // 3:30–6:00 PM open, fitting all three lesson lengths…
    await waitFor(() =>
      expect(canvas.getByText('Tuesday')).toBeInTheDocument(),
    );
    await expect(canvas.getByText(/3:30 PM – 6:00 PM/)).toBeInTheDocument();
    await expect(canvas.getByText(/fits 30 · 45 · 60 min/)).toBeInTheDocument();
    // …and the one-off 3:30 make-up shows as a this-week heads-up, not a
    // disqualifier.
    await expect(canvas.getByText(/⚠ Music Lesson.*this week/)).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { weekState: { status: 'loading' } },
};

export const ErrorState: Story = {
  args: { weekState: { status: 'error', error: 'Network blip.' } },
};

const noBlocks: GetMyWeekResponse = {
  unlinked: false,
  commitments: [],
  standing: [],
  blocks: [],
};

export const NoBlocks: Story = {
  args: { weekState: { status: 'success', data: noBlocks } },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(
        canvas.getByText(/don’t have any lesson blocks yet/i),
      ).toBeInTheDocument(),
    );
  },
};

const fullyBooked: GetMyWeekResponse = {
  unlinked: false,
  blocks: [
    {
      id: 'blk-tue',
      teacherId: 'instructor-001',
      dayOfWeek: 2,
      startMinutes: 15 * 60,
      endMinutes: 16 * 60, // a 1-hour block…
      label: 'Tue afternoons',
    },
  ],
  // …fully taken by a standing 3:00–4:00 lesson.
  standing: [
    {
      id: 'std-lesson-tue',
      weekday: 2,
      startMinutes: 15 * 60,
      durationMinutes: 60,
      category: 'lesson',
      ownership: 'mine',
      title: 'Music Lesson',
    },
  ],
  commitments: [],
};

export const FullyBooked: Story = {
  args: { weekState: { status: 'success', data: fullyBooked } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Tuesday')).toBeInTheDocument());
    await expect(canvas.getByText(/Fully booked/i)).toBeInTheDocument();
  },
};

export const Unlinked: Story = {
  args: {
    weekState: {
      status: 'success',
      data: { commitments: [], standing: [], blocks: [], unlinked: true },
    },
  },
};
