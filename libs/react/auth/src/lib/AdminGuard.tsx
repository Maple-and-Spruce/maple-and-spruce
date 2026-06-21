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
import type { RequestState } from '@maple/ts/domain';
import { useAdminStatus } from './useAdminStatus';
import { useAuth } from './useAuth';

export interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Props for the presentational AdminGuardView component.
 * Exposed for Storybook testing.
 */
export interface AdminGuardViewProps {
  children: ReactNode;
  isAdmin: boolean;
  isCheckingAdmin: boolean;
  adminState: RequestState<boolean>;
  onSignOut: () => void;
}

/**
 * Presentational component for AdminGuard states.
 * Accepts all state as props for testability in Storybook.
 */
export function AdminGuardView({
  children,
  isAdmin,
  isCheckingAdmin,
  adminState,
  onSignOut,
}: AdminGuardViewProps) {
  // While checking admin status, keep children mounted (but hidden) so their
  // data hooks fire in parallel with the admin check instead of waiting for it
  // to resolve. The overlay hides any admin content until access is confirmed;
  // the admin-only Cloud Functions reject non-admins server-side, so kicking
  // off these fetches before the check completes is safe.
  if (isCheckingAdmin) {
    return (
      <Box sx={{ position: 'relative', minHeight: '100vh' }}>
        <Box sx={{ visibility: 'hidden' }} aria-hidden>
          {children}
        </Box>
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
      </Box>
    );
  }

  // If check failed with error, show a generic message
  if (adminState.status === 'error') {
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

  // Not an admin - show friendly message
  if (!isAdmin) {
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

  // User is admin, render children
  return <>{children}</>;
}

/**
 * Guards content that requires admin access.
 *
 * Shows a loading spinner while checking admin status,
 * a friendly message if the user is not an admin,
 * or renders children if the user is an admin.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { isAdmin, isCheckingAdmin, adminState } = useAdminStatus();
  const { signOut } = useAuth();

  return (
    <AdminGuardView
      isAdmin={isAdmin}
      isCheckingAdmin={isCheckingAdmin}
      adminState={adminState}
      onSignOut={signOut}
    >
      {children}
    </AdminGuardView>
  );
}
