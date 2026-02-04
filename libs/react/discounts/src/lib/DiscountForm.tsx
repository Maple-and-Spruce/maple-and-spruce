'use client';

import { useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  InputAdornment,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import type {
  Discount,
  CreateDiscountInput,
  DiscountType,
  DiscountStatus,
  PercentDiscountData,
  AmountDiscountData,
  AmountBeforeDateDiscountData,
} from '@maple/ts/domain';
import { DISCOUNT_TYPES, DISCOUNT_STATUSES } from '@maple/ts/domain';
import { discountValidation } from '@maple/ts/validation';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

interface DiscountFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateDiscountInput) => Promise<void>;
  discount?: Discount;
  isSubmitting?: boolean;
}

export function DiscountForm({
  open,
  onClose,
  onSubmit,
  discount,
  isSubmitting = false,
}: DiscountFormProps) {
  useSignals();

  // Form field signals
  const code = useSignal('');
  const type = useSignal<DiscountType>('percent');
  const description = useSignal('');
  const status = useSignal<DiscountStatus>('active');
  const percent = useSignal<number | undefined>(undefined);
  const amountCents = useSignal<number | undefined>(undefined);
  const cutoffDate = useSignal<Date | undefined>(undefined);

  // UI state
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  // Display value for dollar amount input (convert cents to dollars)
  const amountDollars = useComputed(() => {
    if (amountCents.value === undefined) return '';
    return (amountCents.value / 100).toString();
  });

  // Validation
  const validation = useComputed(() => {
    return discountValidation({
      code: code.value,
      type: type.value,
      description: description.value,
      status: status.value,
      percent: percent.value,
      amountCents: amountCents.value,
      cutoffDate: cutoffDate.value,
    });
  });

  const errors = useComputed<Record<string, string[]>>(() => {
    if (!showValidationErrors.value) return {};
    return validation.value.getErrors();
  });

  const getFieldError = useCallback(
    (field: string): string | undefined => {
      const fieldErrors = errors.value[field];
      return fieldErrors?.[0];
    },
    [errors]
  );

  // Initialize form when opening
  useEffect(() => {
    if (!open) return;

    if (discount) {
      batch(() => {
        code.value = discount.code;
        type.value = discount.type;
        description.value = discount.description;
        status.value = discount.status;
        percent.value =
          discount.type === 'percent' ? discount.percent : undefined;
        amountCents.value =
          discount.type === 'amount' || discount.type === 'amount-before-date'
            ? discount.amountCents
            : undefined;
        cutoffDate.value =
          discount.type === 'amount-before-date'
            ? new Date(discount.cutoffDate)
            : undefined;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      batch(() => {
        code.value = '';
        type.value = 'percent';
        description.value = '';
        status.value = 'active';
        percent.value = undefined;
        amountCents.value = undefined;
        cutoffDate.value = undefined;
        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
  }, [open, discount]);

  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;

    if (!validation.value.isValid()) return;

    submitError.value = null;

    try {
      // Build the discriminated union input
      // Use explicit typed objects to satisfy the discriminated union
      const base = {
        code: code.value.toUpperCase(),
        description: description.value,
        status: status.value,
      };

      let input: CreateDiscountInput;

      if (type.value === 'percent') {
        const percentInput: Omit<PercentDiscountData, 'id' | 'createdAt' | 'updatedAt'> = {
          ...base,
          type: 'percent',
          percent: percent.value!,
        };
        input = percentInput;
      } else if (type.value === 'amount') {
        const amountInput: Omit<AmountDiscountData, 'id' | 'createdAt' | 'updatedAt'> = {
          ...base,
          type: 'amount',
          amountCents: amountCents.value!,
        };
        input = amountInput;
      } else {
        const earlyBirdInput: Omit<AmountBeforeDateDiscountData, 'id' | 'createdAt' | 'updatedAt'> = {
          ...base,
          type: 'amount-before-date',
          amountCents: amountCents.value!,
          cutoffDate: cutoffDate.value!,
        };
        input = earlyBirdInput;
      }

      await onSubmit(input);
    } catch (error: unknown) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to save discount';
    }
  }, [onSubmit, validation, type, code, description, status, percent, amountCents, cutoffDate]);

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === '') {
        amountCents.value = undefined;
      } else {
        const dollars = parseFloat(value);
        if (!isNaN(dollars)) {
          amountCents.value = Math.round(dollars * 100);
        }
      }
    },
    [amountCents]
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {discount ? 'Edit Discount' : 'Add Discount Code'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert
              severity="error"
              onClose={() => (submitError.value = null)}
            >
              {submitError.value}
            </Alert>
          )}

          <TextField
            label="Discount Code"
            value={code.value}
            onChange={(e) =>
              (code.value = e.target.value.toUpperCase())
            }
            error={!!getFieldError('code')}
            helperText={
              getFieldError('code') ||
              'Letters, numbers, and hyphens only (e.g., SAVE10, EARLY-BIRD)'
            }
            required
            fullWidth
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />

          <TextField
            label="Description"
            value={description.value}
            onChange={(e) => (description.value = e.target.value)}
            error={!!getFieldError('description')}
            helperText={getFieldError('description')}
            required
            fullWidth
            placeholder="e.g., 10% off your registration"
          />

          <FormControl fullWidth required error={!!getFieldError('type')}>
            <InputLabel>Discount Type</InputLabel>
            <Select
              value={type.value}
              label="Discount Type"
              onChange={(e) => {
                type.value = e.target.value as DiscountType;
                // Reset type-specific fields
                if (e.target.value === 'percent') {
                  amountCents.value = undefined;
                  cutoffDate.value = undefined;
                } else if (e.target.value === 'amount') {
                  percent.value = undefined;
                  cutoffDate.value = undefined;
                } else {
                  percent.value = undefined;
                }
              }}
            >
              {DISCOUNT_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t === 'percent'
                    ? 'Percentage Off'
                    : t === 'amount'
                      ? 'Fixed Dollar Amount'
                      : 'Early Bird (Amount Before Date)'}
                </MenuItem>
              ))}
            </Select>
            {getFieldError('type') && (
              <FormHelperText>{getFieldError('type')}</FormHelperText>
            )}
          </FormControl>

          {type.value === 'percent' && (
            <TextField
              label="Percent Off"
              type="number"
              value={percent.value ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                percent.value = val === '' ? undefined : Number(val);
              }}
              error={!!getFieldError('percent')}
              helperText={getFieldError('percent') || '1-100'}
              required
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">%</InputAdornment>
                ),
              }}
              inputProps={{ min: 1, max: 100 }}
            />
          )}

          {(type.value === 'amount' ||
            type.value === 'amount-before-date') && (
            <TextField
              label="Discount Amount"
              type="number"
              value={amountDollars.value}
              onChange={handleAmountChange}
              error={!!getFieldError('amountCents')}
              helperText={getFieldError('amountCents')}
              required
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
              }}
              inputProps={{ min: 0.01, step: 0.01 }}
            />
          )}

          {type.value === 'amount-before-date' && (
            <DatePicker
              label="Cutoff Date"
              value={cutoffDate.value ?? null}
              onChange={(newValue) => {
                cutoffDate.value = newValue ?? undefined;
              }}
              disablePast
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  error: !!getFieldError('cutoffDate'),
                  helperText:
                    getFieldError('cutoffDate') ||
                    'Discount only valid before this date',
                },
              }}
            />
          )}

          <FormControl fullWidth required error={!!getFieldError('status')}>
            <InputLabel>Status</InputLabel>
            <Select
              value={status.value}
              label="Status"
              onChange={(e) =>
                (status.value = e.target.value as DiscountStatus)
              }
            >
              {DISCOUNT_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </MenuItem>
              ))}
            </Select>
            {getFieldError('status') && (
              <FormHelperText>{getFieldError('status')}</FormHelperText>
            )}
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? 'Saving...'
            : discount
              ? 'Update'
              : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
