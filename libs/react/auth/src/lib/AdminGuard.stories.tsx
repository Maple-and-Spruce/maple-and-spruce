import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import { Box, Typography } from '@mui/material';
import type { RequestState } from '@maple/ts/domain';
import { AdminGuardView } from './AdminGuard';

/**
 * Sample children content to render when admin access is granted.
 */
const AdminContent = () => (
  <Box sx={{ p: 4 }}>
    <Typography variant="h4" gutterBottom>
      Admin Dashboard
    </Typography>
    <Typography>This content is only visible to admin users.</Typography>
  </Box>
);

const adminSuccessState: RequestState<boolean> = {
  status: 'success',
  data: true,
};

const nonAdminSuccessState: RequestState<boolean> = {
  status: 'success',
  data: false,
};

const loadingState: RequestState<boolean> = { status: 'loading' };

const errorState: RequestState<boolean> = {
  status: 'error',
  error: 'Network request failed',
};

const idleState: RequestState<boolean> = { status: 'idle' };

const meta = {
  component: AdminGuardView,
  title: 'Auth/AdminGuard',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onSignOut: fn(),
    children: <AdminContent />,
  },
} satisfies Meta<typeof AdminGuardView>;

export default meta;
type Story = StoryObj<typeof AdminGuardView>;

// ============================================================
// VISUAL STORIES
// ============================================================

/**
 * Loading state — spinner shown while checking admin status.
 */
export const Loading: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: true,
    adminState: loadingState,
  },
};

/**
 * Admin user — children content is rendered.
 */
export const AdminUser: Story = {
  args: {
    isAdmin: true,
    isCheckingAdmin: false,
    adminState: adminSuccessState,
  },
};

/**
 * Non-admin user — friendly onboarding message with sign-out button.
 */
export const NotAdmin: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: nonAdminSuccessState,
  },
};

/**
 * Error state — generic error message with sign-out button.
 */
export const Error: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: errorState,
  },
};

/**
 * Idle state (no user) — shows the not-admin message.
 */
export const IdleNoUser: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: idleState,
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

/**
 * Verifies the non-admin lock screen displays the correct onboarding
 * message and that the Sign Out button fires the callback.
 */
export const NotAdminShowsOnboardingMessage: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: nonAdminSuccessState,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Verify the welcome heading is present
    await waitFor(() => {
      expect(
        canvas.getByText(/Welcome to Maple & Spruce/i)
      ).toBeInTheDocument();
    });

    // Verify the onboarding message is present
    expect(
      canvas.getByText(/Looking forward to onboarding you/i)
    ).toBeInTheDocument();

    expect(
      canvas.getByText(/a manager at Maple & Spruce will onboard you/i)
    ).toBeInTheDocument();

    // Verify the lock icon is present
    expect(canvasElement.querySelector('[data-testid="LockOutlinedIcon"]')).toBeInTheDocument();

    // Verify children are NOT rendered
    expect(canvas.queryByText(/Admin Dashboard/i)).not.toBeInTheDocument();

    // Click Sign Out
    await userEvent.click(canvas.getByRole('button', { name: /sign out/i }));
    await expect(args.onSignOut).toHaveBeenCalledTimes(1);
  },
};

/**
 * Verifies the error state displays the correct message
 * and that the Sign Out button fires the callback.
 */
export const ErrorShowsMessageAndSignOut: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: errorState,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Verify error heading
    await waitFor(() => {
      expect(canvas.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    // Verify error description
    expect(
      canvas.getByText(/couldn't verify your access/i)
    ).toBeInTheDocument();

    // Verify children are NOT rendered
    expect(canvas.queryByText(/Admin Dashboard/i)).not.toBeInTheDocument();

    // Click Sign Out
    await userEvent.click(canvas.getByRole('button', { name: /sign out/i }));
    await expect(args.onSignOut).toHaveBeenCalledTimes(1);
  },
};

/**
 * Verifies that admin users see the children content
 * and do NOT see the lock screen.
 */
export const AdminRendersChildren: Story = {
  args: {
    isAdmin: true,
    isCheckingAdmin: false,
    adminState: adminSuccessState,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Verify children are rendered
    await waitFor(() => {
      expect(canvas.getByText(/Admin Dashboard/i)).toBeInTheDocument();
    });

    expect(
      canvas.getByText(/only visible to admin users/i)
    ).toBeInTheDocument();

    // Verify lock screen elements are NOT present
    expect(
      canvas.queryByText(/Welcome to Maple & Spruce/i)
    ).not.toBeInTheDocument();

    expect(
      canvas.queryByText(/Something went wrong/i)
    ).not.toBeInTheDocument();

    expect(
      canvas.queryByRole('button', { name: /sign out/i })
    ).not.toBeInTheDocument();
  },
};

/**
 * Verifies the loading state shows a spinner overlaying the (hidden) children,
 * and not the lock or error screen.
 */
export const LoadingShowsSpinner: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: true,
    adminState: loadingState,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Verify spinner is present (MUI CircularProgress renders with role="progressbar")
    await waitFor(() => {
      expect(canvas.getByRole('progressbar')).toBeInTheDocument();
    });

    // Children are kept mounted but hidden while checking, so their data
    // hooks fetch in parallel with the admin check. The spinner overlays
    // them until access resolves — so the content is present but not visible.
    expect(canvas.getByText(/Admin Dashboard/i)).not.toBeVisible();
    expect(
      canvas.queryByText(/Welcome to Maple & Spruce/i)
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText(/Something went wrong/i)
    ).not.toBeInTheDocument();
  },
};

// ============================================================
// ROUTE SIMULATION TESTS
// Each simulates what a non-admin user would see on different
// admin routes — they all get the same lock screen.
// ============================================================

/**
 * Simulates a non-admin visiting /inventory — sees lock screen.
 */
export const NonAdminOnInventoryRoute: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: nonAdminSuccessState,
    children: (
      <Box sx={{ p: 4 }}>
        <Typography variant="h4">Inventory</Typography>
        <Typography>Product management content</Typography>
      </Box>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(
        canvas.getByText(/Looking forward to onboarding you/i)
      ).toBeInTheDocument();
    });

    // Route-specific content should NOT be visible
    expect(canvas.queryByText('Inventory')).not.toBeInTheDocument();
    expect(
      canvas.queryByText(/Product management content/i)
    ).not.toBeInTheDocument();
  },
};

/**
 * Simulates a non-admin visiting /artists — sees lock screen.
 */
export const NonAdminOnArtistsRoute: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: nonAdminSuccessState,
    children: (
      <Box sx={{ p: 4 }}>
        <Typography variant="h4">Artists</Typography>
        <Typography>Artist management content</Typography>
      </Box>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(
        canvas.getByText(/Looking forward to onboarding you/i)
      ).toBeInTheDocument();
    });

    expect(canvas.queryByText('Artists')).not.toBeInTheDocument();
  },
};

/**
 * Simulates a non-admin visiting /classes — sees lock screen.
 */
export const NonAdminOnClassesRoute: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: nonAdminSuccessState,
    children: (
      <Box sx={{ p: 4 }}>
        <Typography variant="h4">Classes</Typography>
        <Typography>Class management content</Typography>
      </Box>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(
        canvas.getByText(/Looking forward to onboarding you/i)
      ).toBeInTheDocument();
    });

    expect(canvas.queryByText('Classes')).not.toBeInTheDocument();
  },
};

/**
 * Simulates a non-admin visiting /registrations — sees lock screen.
 */
export const NonAdminOnRegistrationsRoute: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: nonAdminSuccessState,
    children: (
      <Box sx={{ p: 4 }}>
        <Typography variant="h4">Registrations</Typography>
        <Typography>Registration management content</Typography>
      </Box>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(
        canvas.getByText(/Looking forward to onboarding you/i)
      ).toBeInTheDocument();
    });

    expect(canvas.queryByText('Registrations')).not.toBeInTheDocument();
  },
};

/**
 * Simulates a non-admin visiting /discounts — sees lock screen.
 */
export const NonAdminOnDiscountsRoute: Story = {
  args: {
    isAdmin: false,
    isCheckingAdmin: false,
    adminState: nonAdminSuccessState,
    children: (
      <Box sx={{ p: 4 }}>
        <Typography variant="h4">Discounts</Typography>
        <Typography>Discount management content</Typography>
      </Box>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(
        canvas.getByText(/Looking forward to onboarding you/i)
      ).toBeInTheDocument();
    });

    expect(canvas.queryByText('Discounts')).not.toBeInTheDocument();
  },
};
