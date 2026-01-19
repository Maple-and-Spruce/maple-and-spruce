import type { Meta, StoryObj } from '@storybook/react';
import { Box, Typography } from '@mui/material';
import { AuthGuard } from './AuthGuard';

/**
 * AuthGuard protects routes and redirects unauthenticated users.
 *
 * Note: This component depends on Firebase auth and Next.js navigation.
 * The stories demonstrate the component structure, but auth state
 * changes require proper Firebase mocking.
 */
const meta = {
  component: AuthGuard,
  title: 'Auth/AuthGuard',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/inventory',
      },
    },
  },
} satisfies Meta<typeof AuthGuard>;

export default meta;
type Story = StoryObj<typeof AuthGuard>;

const ProtectedContent = () => (
  <Box sx={{ p: 4 }}>
    <Typography variant="h4" gutterBottom>
      Protected Content
    </Typography>
    <Typography>
      This content is only visible to authenticated users.
    </Typography>
  </Box>
);

/**
 * AuthGuard protecting a private route.
 *
 * Note: Without Firebase auth state, this will show a loading spinner
 * as the component waits for auth state to resolve.
 */
export const ProtectedRoute: Story = {
  args: {
    publicRoutes: ['/login'],
    children: <ProtectedContent />,
  },
};

/**
 * AuthGuard on a public route (login page).
 *
 * Public routes render children immediately without auth check.
 */
export const PublicRoute: Story = {
  args: {
    publicRoutes: ['/login'],
    children: (
      <Box sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Login Page
        </Typography>
        <Typography>
          This is a public page - no authentication required.
        </Typography>
      </Box>
    ),
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/login',
      },
    },
  },
};
