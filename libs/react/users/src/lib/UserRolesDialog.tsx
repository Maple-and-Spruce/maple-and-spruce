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
  Stack,
  Typography,
} from '@mui/material';
import type { AppUser } from '@maple/ts/domain';

export interface UserRolesDialogProps {
  open: boolean;
  user: AppUser | null;
  /** Caller's UID — used to disable the admin-revoke action on themselves. */
  callerUid: string | null;
  onClose: () => void;
  onGrantAdmin: (uid: string) => Promise<void>;
  onRevokeAdmin: (uid: string) => Promise<void>;
}

/**
 * Dialog for granting / revoking admin access on a single user. Hours
 * and payroll for non-admin staff live in Square Shifts, so the only
 * role this app gates on is admin.
 */
export function UserRolesDialog({
  open,
  user,
  callerUid,
  onClose,
  onGrantAdmin,
  onRevokeAdmin,
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
              Admins can manage classes, instructors, products, and these
              role assignments.
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
