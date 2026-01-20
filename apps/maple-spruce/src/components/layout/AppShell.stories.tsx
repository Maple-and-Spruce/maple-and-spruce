import type { Meta, StoryObj } from '@storybook/react';
import { Box, Typography } from '@mui/material';
import { AppShell } from '.';

/**
 * AppShell provides the main application layout with navigation.
 *
 * Note: This component uses Next.js navigation (usePathname) and
 * the UserMenu component which requires Firebase auth. In Storybook,
 * these are mocked via the nextjs framework integration.
 */
const meta = {
  component: AppShell,
  title: 'Layout/AppShell',
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
