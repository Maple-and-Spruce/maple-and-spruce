import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import { expect, within } from 'storybook/test';
import { ClassesThisWeekCard } from './ClassesThisWeekCard';
import {
  FIXTURE_NOW,
  fixtureClasses,
  fixtureRegistrations,
} from './dashboard-fixtures';

/** Classes this week (#235). */
const meta = {
  component: ClassesThisWeekCard,
  title: 'Dashboard/ClassesThisWeekCard',
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <Box sx={{ maxWidth: 420 }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    classesState: { status: 'success', data: fixtureClasses },
    registrationsState: { status: 'success', data: fixtureRegistrations },
    now: FIXTURE_NOW,
  },
} satisfies Meta<typeof ClassesThisWeekCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Data: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Classes this week' })
    ).toBeInTheDocument();
    await expect(canvas.getAllByRole('progressbar')).toHaveLength(3);
    await expect(canvas.getByText('Tonight · 6:00 PM · $95')).toBeInTheDocument();
    await expect(canvas.getByText('Thu, Oct 15 · 6:00 PM · $40')).toBeInTheDocument();
    await expect(canvas.getByText('1/10')).toHaveAttribute('data-low', 'true');
    await expect(canvas.getByText('5/8')).not.toHaveAttribute('data-low');
    await expect(canvas.queryByText('Draft Class')).not.toBeInTheDocument();
    await expect(canvas.getByText('14 seats open across 3 classes')).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { classesState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No classes this week')).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { classesState: { status: 'idle' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvas.queryByText('No classes this week')).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  name: 'Error',
  args: { classesState: { status: 'error', error: 'internal' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('internal');
    await expect(canvas.queryByText('No classes this week')).not.toBeInTheDocument();
  },
};
