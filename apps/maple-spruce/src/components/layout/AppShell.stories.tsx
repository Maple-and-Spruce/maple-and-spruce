import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Box, Typography } from '@mui/material';
import { StaticRolesProvider } from '@maple/react/auth';
import { AppShell } from '.';

/**
 * AppShell provides the main application layout with navigation.
 *
 * Note: This component uses Next.js navigation (usePathname) and
 * the UserMenu component which requires Firebase auth. In Storybook,
 * these are mocked via the nextjs framework integration. Nav items are
 * filtered by the current user's roles, provided here via
 * StaticRolesProvider (admin = full nav).
 */
const meta = {
  component: AppShell,
  title: 'Layout/AppShell',
  decorators: [
    (Story) => (
      <StaticRolesProvider roles={['admin']}>
        <Story />
      </StaticRolesProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
      },
    },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof AppShell>;

const SampleContent = () => (
  <Box>
    <Typography variant="h4" gutterBottom>
      Page Content
    </Typography>
    <Typography>
      This is sample content inside the AppShell. The AppShell provides
      consistent navigation and layout across all pages.
    </Typography>
  </Box>
);

/**
 * Default desktop view with navigation
 */
export const Default: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
};

/**
 * Full width layout (no max-width constraint)
 */
export const FullWidth: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: false,
  },
};

/**
 * Small container width
 */
export const SmallContainer: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'sm',
  },
};

/**
 * On the Inventory page (active nav item)
 */
export const InventoryPage: Story = {
  args: {
    children: (
      <Box>
        <Typography variant="h4" gutterBottom>
          Inventory
        </Typography>
        <Typography>Inventory page content</Typography>
      </Box>
    ),
    maxWidth: 'lg',
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/inventory',
      },
    },
  },
};

/**
 * On the Artists page (active nav item)
 */
export const ArtistsPage: Story = {
  args: {
    children: (
      <Box>
        <Typography variant="h4" gutterBottom>
          Artists
        </Typography>
        <Typography>Artists page content</Typography>
      </Box>
    ),
    maxWidth: 'lg',
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/artists',
      },
    },
  },
};

/**
 * Nav filtered for an MT teacher (Stephanie): Music Together + shared
 * calendar items only — no Store operations, no Admin group.
 */
export const MtTeacherNav: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  decorators: [
    (Story) => (
      <StaticRolesProvider roles={['mt-teacher']}>
        <Story />
      </StaticRolesProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Sections')).toBeInTheDocument();
    await expect(canvas.getByText('Spruce Room Schedule')).toBeInTheDocument();
    await expect(canvas.queryByText('Inventory')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Users')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Students')).not.toBeInTheDocument();
  },
};

/**
 * Nav filtered for a clerk + lesson teacher (Nathan): store operations,
 * registrations, and students — no class definitions, no Admin group.
 */
export const ClerkLessonTeacherNav: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  decorators: [
    (Story) => (
      <StaticRolesProvider roles={['clerk', 'lesson-teacher']}>
        <Story />
      </StaticRolesProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Inventory')).toBeInTheDocument();
    await expect(canvas.getByText('Registrations')).toBeInTheDocument();
    await expect(canvas.getByText('Students')).toBeInTheDocument();
    await expect(canvas.queryByText('Instructors')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Teacher Payouts')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Users')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Sections')).not.toBeInTheDocument();
  },
};
