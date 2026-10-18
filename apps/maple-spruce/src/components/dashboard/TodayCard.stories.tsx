import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import { expect, within } from 'storybook/test';
import { TodayCard } from './TodayCard';
import {
  FIXTURE_NOW,
  fixtureClasses,
  fixtureRegistrations,
  fixtureStudioDay,
} from './dashboard-fixtures';

/**
 * Today (#235): every teacher's lessons and today's class sessions on one
 * timeline. All people here are invented.
 */
const meta = {
  component: TodayCard,
  title: 'Dashboard/TodayCard',
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <Box sx={{ maxWidth: 420 }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    lessonsState: { status: 'success', data: fixtureStudioDay },
    classesState: { status: 'success', data: fixtureClasses },
    registrationsState: { status: 'success', data: fixtureRegistrations },
    now: FIXTURE_NOW,
  },
} satisfies Meta<typeof TodayCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Data: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    await expect(canvas.getByRole('separator', { name: 'NOW 3:10' })).toBeInTheDocument();
    // Two lessons ended; four of the five left are shown.
    const rows = canvas.getAllByRole('link').filter((a) => a.getAttribute('href') !== '/my-day');
    await expect(rows).toHaveLength(4);
    await expect(canvas.queryByText('Olive Thompson · Violin')).not.toBeInTheDocument();
    await expect(canvas.getByText('Milo Fairbanks · Fiddle')).toBeInTheDocument();
    await expect(canvas.getByText('with Ada · Online')).toBeInTheDocument();
    await expect(canvas.getByText('Charges Fri')).toBeInTheDocument();
    await expect(canvas.getByText('Charge failed')).toBeInTheDocument();
    await expect(canvas.getByText('Waived')).toBeInTheDocument();
    await expect(canvas.getByText('Not billed')).toBeInTheDocument();
    await expect(canvas.getByText('2 done · 1 later')).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'My week' })).toHaveAttribute('href', '/my-day');
  },
};

export const LateAfternoon: Story = {
  args: { now: new Date(2026, 9, 14, 17, 40) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Wheel Throwing Basics')).toBeInTheDocument();
    await expect(canvas.getByText('5 of 8 registered')).toBeInTheDocument();
    await expect(canvas.getByText('5/8')).toBeInTheDocument();
    await expect(canvas.getByRole('separator', { name: 'NOW 5:40' })).toBeInTheDocument();
    await expect(canvas.getByText('5 done')).toBeInTheDocument();
  },
};

export const ClassesOnly: Story = {
  name: 'Clerk (classes only)',
  args: { lessonsState: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Wheel Throwing Basics')).toBeInTheDocument();
    await expect(canvas.queryByText('Milo Fairbanks · Fiddle')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Lesson')).not.toBeInTheDocument();
  },
};

export const AllDone: Story = {
  args: { now: new Date(2026, 9, 14, 22, 0) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('All done for today')).toBeInTheDocument();
    await expect(canvas.getByText('7 done')).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    lessonsState: { status: 'success', data: [] },
    classesState: { status: 'success', data: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Nothing scheduled today')).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { lessonsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvas.queryByText('Nothing scheduled today')).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  name: 'Error',
  args: { lessonsState: { status: 'error', error: 'permission-denied' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('permission-denied');
    await expect(canvas.queryByText('Nothing scheduled today')).not.toBeInTheDocument();
  },
};
