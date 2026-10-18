import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import { expect, within } from 'storybook/test';
import { RecentRegistrationsCard } from './RecentRegistrationsCard';
import {
  FIXTURE_NOW,
  fixtureClasses,
  fixtureRegistrations,
} from './dashboard-fixtures';

/** Recent registrations (#235). All people here are invented. */
const meta = {
  component: RecentRegistrationsCard,
  title: 'Dashboard/RecentRegistrationsCard',
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <Box sx={{ maxWidth: 420 }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    registrationsState: { status: 'success', data: fixtureRegistrations },
    classesState: { status: 'success', data: fixtureClasses },
    now: FIXTURE_NOW,
  },
} satisfies Meta<typeof RecentRegistrationsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Data: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Recent registrations' })
    ).toBeInTheDocument();
    await expect(canvas.getByText('7')).toBeInTheDocument();
    await expect(canvas.getByText('$615')).toBeInTheDocument();
    await expect(canvas.getByText('Avery Holloway')).toBeInTheDocument();
    await expect(canvas.getAllByText('Wheel Throwing Basics · Tonight')).toHaveLength(3);
    await expect(canvas.getByText('1h ago')).toBeInTheDocument();
    await expect(canvas.getAllByText('New')).toHaveLength(3);
    // Only the five most recent are listed.
    await expect(canvas.queryByText('Lena Brightwater')).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('link', { name: 'View all 7 this week →' })
    ).toHaveAttribute('href', '/registrations');
  },
};

export const Empty: Story = {
  args: { registrationsState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No registrations this week')).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { registrationsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvas.queryByText('No registrations this week')).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  name: 'Error',
  args: { registrationsState: { status: 'error', error: 'unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('unavailable');
    await expect(canvas.queryByText('No registrations this week')).not.toBeInTheDocument();
  },
};
