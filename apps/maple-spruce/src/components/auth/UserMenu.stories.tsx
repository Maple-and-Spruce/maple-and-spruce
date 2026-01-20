import type { Meta, StoryObj } from '@storybook/react';
import { Box, AppBar, Toolbar, Typography } from '@mui/material';
import { UserMenu } from '@maple/react/auth';

/**
 * UserMenu displays the current user and sign-out option.
 *
 * Note: This component depends on the useAuth hook which requires Firebase.
 * The stories show the component in context but the menu functionality
 * requires Firebase auth to be properly mocked.
 */
const meta = {
  component: UserMenu,
  title: 'Auth/UserMenu',
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <Box sx={{ width: 400 }}>
        <AppBar position="static" color="secondary">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Maple & Spruce
            </Typography>
            <Story />
          </Toolbar>
        </AppBar>
      </Box>
    ),
  ],
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof UserMenu>;

/**
 * UserMenu in the AppBar context.
 *
 * Note: The menu icon will only appear when a user is authenticated.
 * Without Firebase auth mocking, this will render as empty.
 * See the AppShell stories for the full navigation context.
 */
export const Default: Story = {
  args: {},
};
