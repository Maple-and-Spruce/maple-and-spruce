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
import type { UserRole } from '@maple/ts/firebase/api-types';
import { useUserRole } from './useUserRole';
import { useAuth } from './useAuth';

export interface EmployeeGuardProps {
  children: ReactNode;
}

export interface EmployeeGuardViewProps {
  children: ReactNode;
  hasAccess: boolean;
  isCheckingRole: boolean;
  roleState: RequestState<UserRole>;
  onSignOut: () => void;
}

/**
 * Presentational component for the EmployeeGuard. Admits both admin
 * and employee — used on routes (currently `/timesheet`) where Katie
 * and Nathan both need access.
 */
export function EmployeeGuardView({
  children,
  hasAccess,
  isCheckingRole,
  roleState,
  onSignOut,
}: EmployeeGuardViewProps) {
  if (isCheckingRole) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (roleState.status === 'error') {
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

  if (!hasAccess) {
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

  return <>{children}</>;
}

/**
 * Guards content that requires admin OR employee role.
 */
export function EmployeeGuard({ children }: EmployeeGuardProps) {
  const { isAdmin, isEmployee, isCheckingRole, roleState } = useUserRole();
  const { signOut } = useAuth();
  const hasAccess = isAdmin || isEmployee;

  return (
    <EmployeeGuardView
      hasAccess={hasAccess}
      isCheckingRole={isCheckingRole}
      roleState={roleState}
      onSignOut={signOut}
    >
      {children}
    </EmployeeGuardView>
  );
}
