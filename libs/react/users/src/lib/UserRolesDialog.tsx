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
  TextField,
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
  onCreateEmployee: (input: {
    id: string;
    name: string;
    email: string;
    hourlyRate: number;
  }) => Promise<void>;
  onUpdateEmployee: (input: {
    id: string;
    hourlyRate?: number;
    status?: 'active' | 'inactive';
  }) => Promise<void>;
}

type Mode = 'idle' | 'addEmployee' | 'editRate';

/**
 * Switchboard for managing a single user's roles. Admin actions are instant;
 * employee actions that require new data (creating a payroll record, editing
 * the rate) expand inline forms.
 */
export function UserRolesDialog({
  open,
  user,
  callerUid,
  onClose,
  onGrantAdmin,
  onRevokeAdmin,
  onCreateEmployee,
  onUpdateEmployee,
}: UserRolesDialogProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-employee form state
  const [name, setName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  // Edit-rate form state (separate so the input doesn't reset between toggles)
  const [editRate, setEditRate] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('idle');
    setBusy(false);
    setError(null);
    setName(user?.displayName ?? '');
    setHourlyRate('');
    setEditRate(user?.employee ? String(user.employee.hourlyRate) : '');
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

  const submitAddEmployee = async () => {
    const parsedRate = parseFloat(hourlyRate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError('Hourly rate must be greater than 0');
      return;
    }
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!user.email) {
      setError(
        "This user doesn't have an email on file — can't create an employee record."
      );
      return;
    }
    await wrapAction(async () => {
      await onCreateEmployee({
        id: user.uid,
        name: name.trim(),
        email: user.email!,
        hourlyRate: parsedRate,
      });
      setMode('idle');
    });
  };

  const submitEditRate = async () => {
    const parsedRate = parseFloat(editRate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError('Hourly rate must be greater than 0');
      return;
    }
    await wrapAction(async () => {
      await onUpdateEmployee({ id: user.uid, hourlyRate: parsedRate });
      setMode('idle');
    });
  };

  const toggleEmployeeActive = async () => {
    if (!user.employee) return;
    const next = user.employee.status === 'active' ? 'inactive' : 'active';
    await wrapAction(async () =>
      onUpdateEmployee({ id: user.uid, status: next })
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Manage roles
        <Typography variant="body2" color="text.secondary">
          {user.displayName ?? user.email ?? user.uid}
          {user.email && user.displayName ? ` · ${user.email}` : ''}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* ADMIN */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Admin
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Full access to the admin app — manage classes, instructors,
              employees, and these role assignments.
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

          <Divider />

          {/* EMPLOYEE */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Employee (hourly)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Lets the user log time on the timesheet page. Has an hourly
              rate used to compute &quot;owed&quot; totals.
            </Typography>

            {user.employee ? (
              <Stack spacing={1}>
                <Typography variant="body2">
                  Rate: ${user.employee.hourlyRate.toFixed(2)}/hr
                  {' · '}
                  Status: {user.employee.status}
                </Typography>
                {mode === 'editRate' ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      type="number"
                      label="New rate ($)"
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value)}
                      slotProps={{
                        htmlInput: { step: 0.25, min: 0 },
                      }}
                    />
                    <Button
                      variant="contained"
                      onClick={submitEditRate}
                      disabled={busy}
                    >
                      Save
                    </Button>
                    <Button onClick={() => setMode('idle')} disabled={busy}>
                      Cancel
                    </Button>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      onClick={() => setMode('editRate')}
                      disabled={busy}
                    >
                      Edit rate
                    </Button>
                    <Button
                      variant="outlined"
                      color={
                        user.employee.status === 'active'
                          ? 'warning'
                          : 'primary'
                      }
                      onClick={toggleEmployeeActive}
                      disabled={busy}
                    >
                      {user.employee.status === 'active'
                        ? 'Deactivate'
                        : 'Reactivate'}
                    </Button>
                  </Stack>
                )}
              </Stack>
            ) : mode === 'addEmployee' ? (
              <Stack spacing={2}>
                <TextField
                  size="small"
                  label="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <TextField
                  size="small"
                  type="number"
                  label="Hourly rate ($)"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  slotProps={{
                    htmlInput: { step: 0.25, min: 0 },
                  }}
                  required
                />
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    onClick={submitAddEmployee}
                    disabled={busy}
                  >
                    Add as employee
                  </Button>
                  <Button onClick={() => setMode('idle')} disabled={busy}>
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Button
                variant="contained"
                color="primary"
                onClick={() => setMode('addEmployee')}
                disabled={busy}
              >
                Add as employee
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
