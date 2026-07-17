'use client';

import { ReactNode } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Paper,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import type { RequestState, UserRole } from '@maple/ts/domain';
import { useRoles } from './RolesProvider';
import { useAuth } from './useAuth';

export interface RoleGuardProps {
  children: ReactNode;
  /**
   * Roles that may pass. Omit to admit any user with at least one role
   * (the route-group gate). Admins always pass.
   */
  allowedRoles?: readonly UserRole[];
}

/**
 * Props for the presentational RoleGuardView component.
 * Exposed for Storybook testing.
 */
export interface RoleGuardViewProps {
  children: ReactNode;
  hasAccess: boolean;
  isChecking: boolean;
  rolesState: RequestState<UserRole[]>;
  onSignOut: () => void;
}

/**
 * Presentational component for RoleGuard states.
 * Accepts all state as props for testability in Storybook.
 */
export function RoleGuardView({
  children,
  hasAccess,
  isChecking,
  rolesState,
  onSignOut,
}: RoleGuardViewProps) {
  // If the roles check failed, show a generic message
  if (rolesState.status === 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          bgcolor: 'background.default',
          px: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            maxWidth: 480,
            textAlign: 'center',
            p: 4,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Something went wrong
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            We couldn&apos;t verify your access. Please try again later.
          </Typography>
          <Button variant="outlined" onClick={onSignOut}>
            Sign Out
          </Button>
        </Paper>
      </Box>
    );
  }

  // Resolved and no access — show the friendly onboarding message.
  // (While still checking, fall through to render children hidden below.)
  if (!isChecking && !hasAccess) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          bgcolor: 'background.default',
          px: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            maxWidth: 480,
            textAlign: 'center',
            p: 4,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <LockOutlinedIcon
            sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }}
          />
          <Typography variant="h5" gutterBottom>
            Welcome to Maple &amp; Spruce
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Looking forward to onboarding you! You don&apos;t currently have
            access but a manager at Maple &amp; Spruce will onboard you.
          </Typography>
          <Button variant="outlined" onClick={onSignOut}>
            Sign Out
          </Button>
        </Paper>
      </Box>
    );
  }

  // Access confirmed, or still checking: render children in a STABLE wrapper
  // so that resolving the check doesn't remount them — a remount refires
  // every data hook (the dashboard was fetching each query a second time the
  // instant the check resolved). While still checking, hide the children
  // behind a spinner overlay; their data hooks fetch in parallel with the
  // roles check (protected functions reject unauthorized users server-side,
  // so the early fetch is safe).
  return (
    <Box sx={{ position: 'relative', minHeight: '100vh' }}>
      <Box
        sx={{ visibility: isChecking ? 'hidden' : 'visible' }}
        aria-hidden={isChecking || undefined}
      >
        {children}
      </Box>
      {isChecking && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: 'background.default',
          }}
        >
          <CircularProgress color="primary" />
        </Box>
      )}
    </Box>
  );
}

/**
 * Guards content behind the user's roles (from RolesProvider — mount one
 * above this in the tree).
 *
 * With no `allowedRoles`, any user holding at least one role passes — the
 * route-group gate that replaces the old binary AdminGuard. With
 * `allowedRoles`, only those roles (or admin) pass — per-page scoping.
 *
 * NOTE: this is UX only. Enforcement lives server-side in each Cloud
 * Function's `requiringRole(...)` check.
 */
export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { roles, isAdmin, hasAnyRole, isCheckingRoles, rolesState } =
    useRoles();
  const { signOut } = useAuth();

  const hasAccess = allowedRoles
    ? isAdmin || roles.some((role) => allowedRoles.includes(role))
    : hasAnyRole;

  return (
    <RoleGuardView
      hasAccess={hasAccess}
      isChecking={isCheckingRoles}
      rolesState={rolesState}
      onSignOut={signOut}
    >
      {children}
    </RoleGuardView>
  );
}
