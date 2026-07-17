import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent } from 'storybook/test';
import { Box, Typography } from '@mui/material';
import type { RequestState, UserRole } from '@maple/ts/domain';
import { RoleGuard } from './RoleGuard';
import { RoleGuardView } from './RoleGuard';
import { StaticRolesProvider } from './RolesProvider';

/**
 * Sample children content to render when access is granted.
 */
const GuardedContent = () => (
  <Box sx={{ p: 4 }}>
    <Typography variant="h4" gutterBottom>
      Portal Content
    </Typography>
    <Typography>This content is only visible to users with a role.</Typography>
  </Box>
);

const successState: RequestState<UserRole[]> = {
  status: 'success',
  data: ['mt-teacher'],
};

const errorState: RequestState<UserRole[]> = {
  status: 'error',
  error: 'Network request failed',
};

const meta = {
  component: RoleGuardView,
  title: 'Auth/RoleGuard',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onSignOut: fn(),
    children: <GuardedContent />,
  },
} satisfies Meta<typeof RoleGuardView>;

export default meta;
type Story = StoryObj<typeof RoleGuardView>;

// ============================================================
// VISUAL STORIES (presentational view)
// ============================================================

/**
 * Checking — spinner shown while roles resolve; children stay mounted
 * but hidden so their data hooks fetch in parallel.
 */
export const Checking: Story = {
  args: {
    hasAccess: false,
    isChecking: true,
    rolesState: { status: 'loading' },
  },
};

/**
 * Access granted — children visible.
 */
export const HasAccess: Story = {
  args: {
    hasAccess: true,
    isChecking: false,
    rolesState: successState,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Portal Content')).toBeVisible();
  },
};

/**
 * No roles — friendly onboarding message, no content leak.
 */
export const NoAccess: Story = {
  args: {
    hasAccess: false,
    isChecking: false,
    rolesState: { status: 'success', data: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/don't currently have access/i)
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText('Portal Content')
    ).not.toBeInTheDocument();
  },
};

/**
 * Roles check failed — generic error with sign-out.
 */
export const CheckFailed: Story = {
  args: {
    hasAccess: false,
    isChecking: false,
    rolesState: errorState,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/something went wrong/i)
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /sign out/i }));
    await expect(args.onSignOut).toHaveBeenCalled();
  },
};

// ============================================================
// CONNECTED STORIES (RoleGuard + StaticRolesProvider)
// ============================================================

/**
 * Full RoleGuard wired through a roles context: an mt-teacher passes the
 * default any-role gate.
 */
export const ConnectedAnyRolePasses: Story = {
  render: () => (
    <StaticRolesProvider roles={['mt-teacher']}>
      <RoleGuard>
        <GuardedContent />
      </RoleGuard>
    </StaticRolesProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Portal Content')).toBeVisible();
  },
};

/**
 * Per-page scoping: an mt-teacher is refused by a clerk-only guard,
 * while an admin would pass (admins always pass).
 */
export const ConnectedScopedRefusal: Story = {
  render: () => (
    <StaticRolesProvider roles={['mt-teacher']}>
      <RoleGuard allowedRoles={['clerk']}>
        <GuardedContent />
      </RoleGuard>
    </StaticRolesProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/don't currently have access/i)
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText('Portal Content')
    ).not.toBeInTheDocument();
  },
};
