'use client';

import { useCallback, useEffect } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import type { AppUser, Employee } from '@maple/ts/domain';
import { employeeValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

export type EmployeeFormSubmit =
  | {
      mode: 'create';
      input: {
        id: string;
        name: string;
        email: string;
        hourlyRate: number;
      };
    }
  | {
      mode: 'update';
      input: {
        id: string;
        name?: string;
        hourlyRate?: number;
        status?: 'active' | 'inactive';
      };
    };

export interface EmployeeFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (submit: EmployeeFormSubmit) => Promise<void>;
  employee?: Employee;
  /**
   * Signed-up Firebase Auth users available to grant the employee role to.
   * Pass the list with employees already filtered out so the picker doesn't
   * surface duplicates. Required for create mode.
   */
  availableUsers?: AppUser[];
  /** Show a loading indicator in place of the picker while users load. */
  usersLoading?: boolean;
  isSubmitting?: boolean;
}

/**
 * Best-guess display name for a user — prefer their displayName, then their
 * email's local part, then a placeholder. Used to seed the Name field when
 * the admin picks a user from the dropdown.
 */
function defaultNameFor(user: AppUser): string {
  if (user.displayName) return user.displayName;
  if (user.email) {
    const local = user.email.split('@')[0];
    if (local) return local;
  }
  return '';
}

export function EmployeeForm({
  open,
  onClose,
  onSubmit,
  employee,
  availableUsers,
  usersLoading = false,
  isSubmitting = false,
}: EmployeeFormProps) {
  useSignals();

  const id = useSignal('');
  const name = useSignal('');
  const email = useSignal('');
  const hourlyRate = useSignal<string>('');
  const status = useSignal<'active' | 'inactive'>('active');

  const showErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const isEdit = !!employee;

  const validation = useComputed(() => {
    const parsedRate = parseFloat(hourlyRate.value);
    return employeeValidation({
      id: id.value,
      name: name.value,
      email: email.value,
      hourlyRate: Number.isFinite(parsedRate) ? parsedRate : undefined,
      status: status.value,
    });
  });

  const errors = useComputed<Record<string, string[]>>(() =>
    showErrors.value ? validation.value.getErrors() : {}
  );

  const fieldError = (field: string) => errors.value[field]?.[0] ?? null;

  useEffect(() => {
    if (!open) return;
    batch(() => {
      if (employee) {
        id.value = employee.id;
        name.value = employee.name;
        email.value = employee.email;
        hourlyRate.value = String(employee.hourlyRate);
        status.value = employee.status;
      } else {
        id.value = '';
        name.value = '';
        email.value = '';
        hourlyRate.value = '';
        status.value = 'active';
      }
      showErrors.value = false;
      submitError.value = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);

  const handleUserSelected = (user: AppUser | null) => {
    batch(() => {
      if (user) {
        id.value = user.uid;
        name.value = defaultNameFor(user);
        email.value = user.email ?? '';
      } else {
        id.value = '';
        name.value = '';
        email.value = '';
      }
    });
  };

  const selectedUser =
    !isEdit && id.value
      ? availableUsers?.find((u) => u.uid === id.value) ?? null
      : null;

  const handleSubmit = useCallback(async () => {
    showErrors.value = true;
    submitError.value = null;

    if (validation.value.hasErrors()) return;

    const parsedRate = parseFloat(hourlyRate.value);
    try {
      if (isEdit && employee) {
        await onSubmit({
          mode: 'update',
          input: {
            id: employee.id,
            name: name.value,
            hourlyRate: parsedRate,
            status: status.value,
          },
        });
      } else {
        await onSubmit({
          mode: 'create',
          input: {
            id: id.value,
            name: name.value,
            email: email.value,
            hourlyRate: parsedRate,
          },
        });
      }
      onClose();
    } catch (e) {
      submitError.value =
        e instanceof Error ? e.message : 'Failed to save employee';
    }
  }, [onSubmit, onClose, isEdit, employee]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit employee' : 'Add employee'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {!isEdit && (
            <Typography variant="body2" color="text.secondary">
              Pick someone who&apos;s already signed up to the admin app and
              set their hourly rate. If the person you&apos;re looking for
              isn&apos;t here, have them sign up first.
            </Typography>
          )}
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          {isEdit ? (
            <>
              <TextField
                label="Email"
                value={email.value}
                disabled
                fullWidth
                helperText="Linked to the Firebase Auth account — cannot be changed"
              />
              <TextField
                label="Name"
                value={name.value}
                onChange={(e) => (name.value = e.target.value)}
                error={!!fieldError('name')}
                helperText={fieldError('name')}
                required
                fullWidth
              />
            </>
          ) : usersLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                py: 3,
              }}
            >
              <CircularProgress size={28} />
            </Box>
          ) : availableUsers && availableUsers.length === 0 ? (
            <Alert severity="info">
              Every signed-up user is already an employee. New people need to
              sign up at the admin app before they can be added here.
            </Alert>
          ) : (
            <>
              <Autocomplete<AppUser>
                options={availableUsers ?? []}
                value={selectedUser}
                onChange={(_, value) => handleUserSelected(value)}
                getOptionLabel={(option) =>
                  option.displayName
                    ? `${option.displayName} · ${option.email ?? '(no email)'}`
                    : option.email ?? option.uid
                }
                isOptionEqualToValue={(option, value) =>
                  option.uid === value.uid
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="User"
                    required
                    error={!!fieldError('id')}
                    helperText={fieldError('id') || 'Sign-up required first'}
                  />
                )}
              />
              {id.value && (
                <TextField
                  label="Name"
                  value={name.value}
                  onChange={(e) => (name.value = e.target.value)}
                  error={!!fieldError('name')}
                  helperText={
                    fieldError('name') ?? 'Defaults from their account'
                  }
                  required
                  fullWidth
                />
              )}
            </>
          )}

          {(isEdit || id.value) && (
            <TextField
              label="Hourly rate ($)"
              type="number"
              value={hourlyRate.value}
              onChange={(e) => (hourlyRate.value = e.target.value)}
              error={!!fieldError('hourlyRate')}
              helperText={fieldError('hourlyRate')}
              slotProps={{ htmlInput: { step: 0.25, min: 0 } }}
              required
              fullWidth
            />
          )}
          {isEdit && (
            <FormControl fullWidth error={!!fieldError('status')}>
              <InputLabel>Status</InputLabel>
              <Select
                value={status.value}
                label="Status"
                onChange={(e) =>
                  (status.value = e.target.value as 'active' | 'inactive')
                }
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">
                  Inactive (revokes timesheet access)
                </MenuItem>
              </Select>
              {fieldError('status') && (
                <FormHelperText>{fieldError('status')}</FormHelperText>
              )}
            </FormControl>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={
            isSubmitting ||
            (!isEdit && !id.value) ||
            (!isEdit && availableUsers?.length === 0)
          }
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
