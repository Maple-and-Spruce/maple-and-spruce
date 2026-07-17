'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import type { AppUser, ScopedUserRole } from '@maple/ts/domain';
import { SCOPED_USER_ROLES, USER_ROLE_LABELS } from '@maple/ts/domain';

export interface UserRolesDialogProps {
  open: boolean;
  user: AppUser | null;
  /** Caller's UID — used to disable the admin-revoke action on themselves. */
  callerUid: string | null;
  onClose: () => void;
  onGrantAdmin: (uid: string) => Promise<void>;
  onRevokeAdmin: (uid: string) => Promise<void>;
  onGrantRole: (uid: string, role: ScopedUserRole) => Promise<void>;
  onRevokeRole: (uid: string, role: ScopedUserRole) => Promise<void>;
}

/** What each scoped role unlocks — shown under the toggle. */
const ROLE_DESCRIPTIONS: Record<ScopedUserRole, string> = {
  'mt-teacher':
    'Manage Music Together: sections, semesters, rosters, and registrations.',
  clerk:
    'Store operations: inventory, sales, class registrations, and refunds.',
  'lesson-teacher':
    'Music lessons: see all lessons, manage their own students and schedule.',
};

/**
 * Dialog for managing a single user's access: the admin role (full
 * access) plus scoped roles (MT teacher, clerk, lesson teacher).
 * Admins implicitly hold every permission, so the scoped toggles are
 * hidden while a user is an admin.
 */
export function UserRolesDialog({
  open,
  user,
  callerUid,
  onClose,
  onGrantAdmin,
  onRevokeAdmin,
  onGrantRole,
  onRevokeRole,
}: UserRolesDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError(null);
  }, [open, user]);

  if (!user) return null;

  const isSelf = user.uid === callerUid;

  const wrapAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Manage admin access
        <Typography variant="body2" color="text.secondary">
          {user.displayName ?? user.email ?? user.uid}
          {user.email && user.displayName ? ` · ${user.email}` : ''}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Admins have full access, including these role assignments.
            </Typography>
            {user.isAdmin ? (
              <Stack spacing={1}>
                <Button
                  variant="outlined"
                  color="warning"
                  disabled={isSelf || busy}
                  onClick={() =>
                    wrapAction(async () => onRevokeAdmin(user.uid))
                  }
                >
                  Revoke admin
                </Button>
                {isSelf && (
                  <Typography variant="caption" color="text.secondary">
                    You can&apos;t revoke your own admin role. Have another
                    admin do it if needed.
                  </Typography>
                )}
              </Stack>
            ) : (
              <Button
                variant="contained"
                color="primary"
                disabled={busy}
                onClick={() => wrapAction(async () => onGrantAdmin(user.uid))}
              >
                Grant admin
              </Button>
            )}
          </Box>

          {!user.isAdmin && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Scoped roles
                </Typography>
                <Stack spacing={1.5}>
                  {SCOPED_USER_ROLES.map((role) => {
                    const hasRole = (user.roles ?? []).includes(role);
                    return (
                      <Box
                        key={role}
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 2,
                        }}
                      >
                        <Box>
                          <Typography variant="body2">
                            {USER_ROLE_LABELS[role]}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {ROLE_DESCRIPTIONS[role]}
                          </Typography>
                        </Box>
                        <Switch
                          checked={hasRole}
                          disabled={busy}
                          inputProps={{
                            'aria-label': USER_ROLE_LABELS[role],
                          }}
                          onChange={() =>
                            wrapAction(async () =>
                              hasRole
                                ? onRevokeRole(user.uid, role)
                                : onGrantRole(user.uid, role)
                            )
                          }
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
