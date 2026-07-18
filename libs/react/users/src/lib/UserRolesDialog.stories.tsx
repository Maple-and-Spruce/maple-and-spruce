import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import type { AppUser } from '@maple/ts/domain';
import { UserRolesDialog } from './UserRolesDialog';

const baseUser: AppUser = {
  uid: 'nathan-uid',
  email: 'nathan@example.com',
  displayName: 'Nathan',
  emailVerified: true,
  disabled: false,
  createdAt: new Date('2026-04-01T12:00:00Z'),
  lastSignInAt: new Date('2026-07-01T09:30:00Z'),
  isAdmin: false,
  roles: [],
};

const meta = {
  component: UserRolesDialog,
  title: 'Users/UserRolesDialog',
  args: {
    open: true,
    callerUid: 'katie-uid',
    onClose: fn(),
    onGrantAdmin: fn(),
    onRevokeAdmin: fn(),
    onGrantRole: fn(),
    onRevokeRole: fn(),
  },
} satisfies Meta<typeof UserRolesDialog>;

export default meta;
type Story = StoryObj<typeof UserRolesDialog>;

/**
 * A user with no access: grant-admin button plus all three scoped-role
 * toggles, all off.
 */
export const NoAccess: Story = {
  args: { user: baseUser },
  play: async () => {
    const dialog = within(document.body);
    await expect(
      await dialog.findByRole('button', { name: /grant admin/i })
    ).toBeInTheDocument();
    await expect(
      dialog.getByRole('switch', { name: 'MT Teacher' })
    ).not.toBeChecked();
    await expect(
      dialog.getByRole('switch', { name: 'Clerk' })
    ).not.toBeChecked();
    await expect(
      dialog.getByRole('switch', { name: 'Lesson Teacher' })
    ).not.toBeChecked();
  },
};

/**
 * Toggling a scoped role on calls onGrantRole with the role's wire value.
 */
export const GrantScopedRole: Story = {
  args: { user: baseUser },
  play: async ({ args }) => {
    const dialog = within(document.body);
    await userEvent.click(
      await dialog.findByRole('switch', { name: 'MT Teacher' })
    );
    await waitFor(() =>
      expect(args.onGrantRole).toHaveBeenCalledWith('nathan-uid', 'mt-teacher')
    );
    await expect(args.onRevokeRole).not.toHaveBeenCalled();
  },
};

/**
 * Toggling a held role off calls onRevokeRole.
 */
export const RevokeScopedRole: Story = {
  args: {
    user: { ...baseUser, roles: ['clerk', 'lesson-teacher'] },
  },
  play: async ({ args }) => {
    const dialog = within(document.body);
    const clerkSwitch = await dialog.findByRole('switch', { name: 'Clerk' });
    await expect(clerkSwitch).toBeChecked();
    await userEvent.click(clerkSwitch);
    await waitFor(() =>
      expect(args.onRevokeRole).toHaveBeenCalledWith('nathan-uid', 'clerk')
    );
    await expect(args.onGrantRole).not.toHaveBeenCalled();
  },
};

/**
 * Admins hold every permission implicitly, so scoped toggles are hidden;
 * only the revoke-admin action shows.
 */
export const AdminUser: Story = {
  args: {
    user: { ...baseUser, uid: 'katie2-uid', isAdmin: true },
  },
  play: async ({ args }) => {
    const dialog = within(document.body);
    await expect(
      await dialog.findByRole('button', { name: /revoke admin/i })
    ).toBeInTheDocument();
    await expect(
      dialog.queryByRole('switch', { name: 'MT Teacher' })
    ).not.toBeInTheDocument();
    await userEvent.click(
      dialog.getByRole('button', { name: /revoke admin/i })
    );
    await waitFor(() =>
      expect(args.onRevokeAdmin).toHaveBeenCalledWith('katie2-uid')
    );
  },
};

/**
 * Self-protection: an admin can't revoke their own admin role.
 */
export const SelfAdmin: Story = {
  args: {
    user: { ...baseUser, uid: 'katie-uid', isAdmin: true },
  },
  play: async () => {
    const dialog = within(document.body);
    await expect(
      await dialog.findByRole('button', { name: /revoke admin/i })
    ).toBeDisabled();
    await expect(
      dialog.getByText(/can't revoke your own admin role/i)
    ).toBeInTheDocument();
  },
};
