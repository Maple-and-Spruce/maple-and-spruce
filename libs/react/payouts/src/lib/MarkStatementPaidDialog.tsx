'use client';

import {
  Alert,
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
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSignal, useSignals } from '@maple/react/signals';
import {
  CLASS_INSTRUCTOR_PAYMENT_METHOD_LABELS,
  type ClassInstructorPaymentMethod,
  type ClassInstructorStatement,
} from '@maple/ts/domain';
import type { MarkClassInstructorStatementPaidRequest } from '@maple/ts/firebase/api-types';
import { markClassInstructorStatementPaidValidation } from '@maple/ts/validation';
import { formatMonth, formatMoney, todayKey } from './payout-format';

export interface MarkStatementPaidDialogProps {
  /** The statement being paid; the dialog is open while this is set. */
  statement: ClassInstructorStatement | null;
  onClose: () => void;
  onSubmit: (input: MarkClassInstructorStatementPaidRequest) => Promise<void>;
}

const METHODS = Object.entries(CLASS_INSTRUCTOR_PAYMENT_METHOD_LABELS) as [
  ClassInstructorPaymentMethod,
  string,
][];

/**
 * Record that David paid a statement outside the app: the day, how
 * (Square Payroll, Bill Pay, other) and an optional reference.
 */
export function MarkStatementPaidDialog({ statement, onClose, onSubmit }: MarkStatementPaidDialogProps) {
  useSignals();
  const paidOn = useSignal(todayKey());
  const paymentMethod = useSignal<ClassInstructorPaymentMethod | ''>('');
  const paymentReference = useSignal('');
  const errors = useSignal<Record<string, string[]>>({});
  const submitError = useSignal('');
  const submitting = useSignal(false);

  const reset = () => {
    paidOn.value = todayKey();
    paymentMethod.value = '';
    paymentReference.value = '';
    errors.value = {};
    submitError.value = '';
  };

  const close = () => {
    if (submitting.value) return;
    reset();
    onClose();
  };

  const submit = async () => {
    // Synchronous guard: a double click must not record the payment twice.
    if (!statement || submitting.value) return;
    const input = {
      id: statement.id,
      paidOn: paidOn.value,
      paymentMethod: paymentMethod.value,
      paymentReference: paymentReference.value.trim() || undefined,
    };
    const result = markClassInstructorStatementPaidValidation(input);
    if (result.hasErrors()) {
      errors.value = result.getErrors();
      return;
    }
    errors.value = {};
    submitError.value = '';
    submitting.value = true;
    try {
      await onSubmit(input as MarkClassInstructorStatementPaidRequest);
      submitting.value = false;
      reset();
      onClose();
    } catch (e) {
      submitting.value = false;
      submitError.value = e instanceof Error ? e.message : 'Failed to mark paid';
    }
  };

  const fieldError = (field: string) => errors.value[field]?.[0];

  return (
    <Dialog open={statement !== null} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>Mark statement paid</DialogTitle>
      <DialogContent>
        {statement && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {statement.instructorName}, {formatMonth(statement.month)}:{' '}
            <strong>{formatMoney(statement.totalOwedCents)}</strong>. Pay it in Square first; this only
            records that you did.
          </Typography>
        )}
        {submitError.value && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {submitError.value}
          </Alert>
        )}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Paid on"
            type="date"
            value={paidOn.value}
            onChange={(e) => {
              paidOn.value = e.target.value;
            }}
            error={Boolean(fieldError('paidOn'))}
            helperText={fieldError('paidOn')}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <FormControl fullWidth error={Boolean(fieldError('paymentMethod'))}>
            <InputLabel id="payment-method-label">Paid with</InputLabel>
            <Select
              labelId="payment-method-label"
              label="Paid with"
              value={paymentMethod.value}
              onChange={(e) => {
                paymentMethod.value = e.target.value as ClassInstructorPaymentMethod;
              }}
            >
              {METHODS.map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
            {fieldError('paymentMethod') && <FormHelperText>{fieldError('paymentMethod')}</FormHelperText>}
          </FormControl>
          <TextField
            label="Reference (optional)"
            value={paymentReference.value}
            onChange={(e) => {
              paymentReference.value = e.target.value;
            }}
            error={Boolean(fieldError('paymentReference'))}
            helperText={fieldError('paymentReference') ?? 'A payroll run or bill number, if it helps later'}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={submitting.value}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={submitting.value}>
          {submitting.value ? 'Saving…' : 'Mark paid'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
