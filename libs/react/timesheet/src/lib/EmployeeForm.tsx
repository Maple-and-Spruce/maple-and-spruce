'use client';

import { useCallback, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
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
import type { Employee } from '@maple/ts/domain';
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
  isSubmitting?: boolean;
}

export function EmployeeForm({
  open,
  onClose,
  onSubmit,
  employee,
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
              The employee must sign up at this admin app first. Then paste
              their Firebase Auth UID below — find it in the Firebase Console
              under Authentication.
            </Typography>
          )}
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          <TextField
            label="Firebase Auth UID"
            value={id.value}
            onChange={(e) => (id.value = e.target.value)}
            error={!!fieldError('id')}
            helperText={fieldError('id') || 'Document ID — cannot be changed'}
            disabled={isEdit}
            required
            fullWidth
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
          <TextField
            label="Email"
            type="email"
            value={email.value}
            onChange={(e) => (email.value = e.target.value)}
            error={!!fieldError('email')}
            helperText={fieldError('email')}
            disabled={isEdit}
            required
            fullWidth
          />
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
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
