'use client';

import { useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  useSignal,
  useComputed,
  useSignals,
  batch,
} from '@maple/react/signals';
import { SquareCardForm } from './SquareCardForm';
import { CostSummary } from './CostSummary';
import type { PublicClass } from '@maple/ts/domain';
import type {
  CalculateRegistrationCostResponse,
  CreateRegistrationResponse,
} from '@maple/ts/firebase/api-types';
import { registrationValidation } from '@maple/ts/validation';
import { formatPhoneNumber } from './formatPhoneNumber';

/**
 * Firebase callable errors have a `code` and `message` property.
 * When the backend returns a structured error, the message contains
 * the user-friendly text. If the message is a generic code like
 * "internal", fall back to a helpful default.
 */
interface FirebaseError {
  code?: string;
  message?: string;
  details?: unknown;
}

const GENERIC_ERROR_CODES = new Set([
  'internal',
  'INTERNAL',
  'unknown',
  'UNKNOWN',
]);

function extractErrorMessage(error: unknown): string {
  const fallback =
    'Something went wrong processing your payment. Please try again.';

  if (!error) return fallback;

  // Firebase FunctionsError (from httpsCallable)
  const fbError = error as FirebaseError;
  if (fbError.message && !GENERIC_ERROR_CODES.has(fbError.message)) {
    return fbError.message;
  }

  // Standard Error
  if (error instanceof Error && !GENERIC_ERROR_CODES.has(error.message)) {
    return error.message;
  }

  return fallback;
}

interface RegistrationCheckoutFormProps {
  publicClass: PublicClass;
  squareApplicationId: string;
  squareLocationId: string;
  /** Square environment — passed through to SquareCardForm */
  env?: string;
  onCalculateCost: (
    classId: string,
    quantity: number,
    discountCode?: string
  ) => Promise<CalculateRegistrationCostResponse>;
  onSubmit: (data: {
    classId: string;
    customerEmail: string;
    customerName: string;
    customerPhone?: string;
    quantity: number;
    discountCode?: string;
    notes?: string;
    paymentNonce: string;
  }) => Promise<CreateRegistrationResponse>;
  onSuccess: (details: {
    confirmationNumber: string;
    customerName: string;
    customerEmail: string;
    pricePaidCents: number;
    quantity: number;
  }) => void;
}

export function RegistrationCheckoutForm({
  publicClass,
  squareApplicationId,
  squareLocationId,
  env,
  onCalculateCost,
  onSubmit,
  onSuccess,
}: RegistrationCheckoutFormProps) {
  useSignals();

  // Customer info
  const customerName = useSignal('');
  const customerEmail = useSignal('');
  const customerPhone = useSignal('');
  const quantity = useSignal(1);
  const discountCode = useSignal('');
  const notes = useSignal('');

  // Cost state
  const costBreakdown = useSignal<CalculateRegistrationCostResponse | null>(
    null
  );
  const isCalculating = useSignal(false);

  // Form state — isSubmitting is a signal, not React state, so mutations
  // are synchronous. Setting it to true at the top of handleSubmit both
  // flips the button to its disabled state immediately AND short-circuits
  // any re-entrant call from a rapid second click, which is the race that
  // caused duplicate charges.
  const isSubmitting = useSignal(false);
  const submitError = useSignal<string | null>(null);
  const isCardReady = useSignal(false);
  const quantityWarning = useSignal<string | null>(null);
  // Gate field errors until the user has attempted a submit once — mirrors
  // the ClassForm/ArtistForm pattern so users aren't yelled at mid-typing.
  const showValidationErrors = useSignal(false);

  // Derived state — guaranteed in sync with its inputs.
  const isFull = useComputed(() => publicClass.spotsRemaining <= 0);
  const maxQuantity = useComputed(() =>
    Math.min(10, publicClass.spotsRemaining)
  );
  const discountApplied = useComputed(
    () => (costBreakdown.value?.discountAmountCents ?? 0) > 0
  );
  const isButtonDisabled = useComputed(
    () => isSubmitting.value || !isCardReady.value || isFull.value
  );

  // ============================================================
  // VALIDATION — Vest suite wired through computed signals.
  // Note: discountCode is intentionally excluded — it's validated
  // server-side by the lookup-discount function.
  // ============================================================
  const validation = useComputed(() =>
    registrationValidation({
      classId: publicClass.id,
      customerName: customerName.value,
      customerEmail: customerEmail.value,
      customerPhone: customerPhone.value || undefined,
      quantity: quantity.value,
      notes: notes.value || undefined,
    })
  );

  const errors = useComputed<Record<string, string[]>>(() => {
    if (!showValidationErrors.value) return {};
    return validation.value.getErrors();
  });

  const isValid = useComputed(() => validation.value.isValid());

  const getFieldError = (field: string): string | null => {
    const fieldErrors = errors.value[field];
    return fieldErrors?.[0] ?? null;
  };

  // Tokenize ref from SquareCardForm — a function handle, not state.
  const tokenizeRef = useRef<(() => Promise<string>) | null>(null);

  const calculateCost = useCallback(
    async (qty: number, code: string) => {
      isCalculating.value = true;
      try {
        const result = await onCalculateCost(
          publicClass.id,
          qty,
          code || undefined
        );
        costBreakdown.value = result;
      } catch (error) {
        console.error('Failed to calculate cost:', error);
      } finally {
        isCalculating.value = false;
      }
    },
    [publicClass.id, onCalculateCost, isCalculating, costBreakdown]
  );

  // Calculate initial cost on mount
  useEffect(() => {
    calculateCost(quantity.value, '');
  }, []);

  const handleQuantityChange = useCallback(
    (newQuantity: number) => {
      const max = maxQuantity.value;
      if (newQuantity > max) {
        batch(() => {
          quantityWarning.value = `Only ${max} spot${max === 1 ? '' : 's'} available. Quantity set to ${max}.`;
          quantity.value = max;
        });
        calculateCost(max, discountCode.value);
      } else {
        const qty = Math.max(1, newQuantity);
        batch(() => {
          quantityWarning.value = null;
          quantity.value = qty;
        });
        calculateCost(qty, discountCode.value);
      }
    },
    [calculateCost, discountCode, maxQuantity, quantity, quantityWarning]
  );

  const handleApplyDiscount = useCallback(() => {
    const code = discountCode.value.trim();
    if (code) {
      calculateCost(quantity.value, code);
    }
  }, [quantity, discountCode, calculateCost]);

  const handleSubmit = useCallback(async () => {
    // Synchronous re-entry check: signal writes are immediate, so a
    // second click that arrives before React re-renders still sees
    // isSubmitting.value === true and bails out.
    if (isSubmitting.value) return;

    // Reveal field-level errors on the first submit attempt. Read
    // validity *after* flipping the flag so the computed error map
    // is populated in the same tick.
    showValidationErrors.value = true;
    if (!isValid.value) {
      return;
    }

    isSubmitting.value = true;
    submitError.value = null;

    try {
      if (!tokenizeRef.current) {
        submitError.value = 'Payment form not ready. Please wait and try again.';
        return;
      }

      const nonce = await tokenizeRef.current();

      const result = await onSubmit({
        classId: publicClass.id,
        customerEmail: customerEmail.value.trim(),
        customerName: customerName.value.trim(),
        customerPhone: customerPhone.value.trim() || undefined,
        quantity: quantity.value,
        discountCode: discountCode.value.trim() || undefined,
        notes: notes.value.trim() || undefined,
        paymentNonce: nonce,
      });

      onSuccess({
        confirmationNumber: result.confirmationNumber,
        customerName: customerName.value.trim(),
        customerEmail: customerEmail.value.trim(),
        pricePaidCents: result.registration.pricePaidCents,
        quantity: quantity.value,
      });
    } catch (error) {
      submitError.value = extractErrorMessage(error);
    } finally {
      isSubmitting.value = false;
    }
  }, [
    customerName,
    customerEmail,
    customerPhone,
    quantity,
    discountCode,
    notes,
    publicClass.id,
    onSubmit,
    onSuccess,
    isSubmitting,
    submitError,
    showValidationErrors,
    isValid,
  ]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {submitError.value && (
        <Alert severity="error" onClose={() => (submitError.value = null)}>
          {submitError.value}
        </Alert>
      )}

      {isFull.value && (
        <Alert severity="warning">
          This class is full. Registration is not available at this time.
        </Alert>
      )}

      {/* Customer Info Section */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Your Information
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Full Name"
            value={customerName.value}
            onChange={(e) => (customerName.value = e.target.value)}
            error={!!getFieldError('customerName')}
            helperText={getFieldError('customerName')}
            required
            fullWidth
          />
          <TextField
            label="Email Address"
            type="email"
            value={customerEmail.value}
            onChange={(e) => (customerEmail.value = e.target.value)}
            error={!!getFieldError('customerEmail')}
            helperText={
              getFieldError('customerEmail') ||
              'Confirmation will be sent to this address'
            }
            required
            fullWidth
          />
          <TextField
            label="Phone Number (optional)"
            type="tel"
            value={customerPhone.value}
            onChange={(e) =>
              (customerPhone.value = formatPhoneNumber(e.target.value))
            }
            error={!!getFieldError('customerPhone')}
            helperText={getFieldError('customerPhone')}
            fullWidth
            placeholder="(304) 555-1234"
          />
          <TextField
            label="Number of Spots"
            type="number"
            value={quantity.value}
            onChange={(e) => handleQuantityChange(Number(e.target.value))}
            inputProps={{ min: 1, max: maxQuantity.value }}
            fullWidth
            disabled={isFull.value}
            error={!!getFieldError('quantity')}
            helperText={
              getFieldError('quantity') ||
              (isFull.value
                ? 'No spots available'
                : `${publicClass.spotsRemaining} spot${publicClass.spotsRemaining === 1 ? '' : 's'} available`)
            }
          />
          {quantityWarning.value && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {quantityWarning.value}
            </Alert>
          )}
          <TextField
            label="Notes (optional)"
            value={notes.value}
            onChange={(e) => (notes.value = e.target.value)}
            multiline
            rows={2}
            fullWidth
            placeholder="Dietary restrictions, accessibility needs, etc."
            error={!!getFieldError('notes')}
            helperText={getFieldError('notes')}
          />
        </Box>
      </Box>

      {/* Discount Code Section */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Discount Code
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label="Enter code"
            value={discountCode.value}
            onChange={(e) =>
              (discountCode.value = e.target.value.toUpperCase())
            }
            size="small"
            sx={{ flex: 1 }}
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />
          <Button
            variant="outlined"
            onClick={handleApplyDiscount}
            disabled={!discountCode.value.trim() || isCalculating.value}
          >
            {isCalculating.value ? <CircularProgress size={20} /> : 'Apply'}
          </Button>
        </Box>
        {discountApplied.value && costBreakdown.value?.discountDescription && (
          <Alert severity="success" sx={{ mt: 1 }}>
            {costBreakdown.value.discountDescription} applied!
          </Alert>
        )}
      </Box>

      {/* Cost Summary */}
      {costBreakdown.value && (
        <CostSummary
          originalCostCents={costBreakdown.value.originalCostCents}
          discountAmountCents={costBreakdown.value.discountAmountCents}
          finalCostCents={costBreakdown.value.finalCostCents}
          taxAmountCents={costBreakdown.value.taxAmountCents}
          taxRatePercent={costBreakdown.value.taxRatePercent}
          totalCents={costBreakdown.value.totalCents}
          discountDescription={costBreakdown.value.discountDescription}
          quantity={quantity.value}
          pricePerItemCents={publicClass.priceCents}
        />
      )}

      {/* Payment Section */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Payment
        </Typography>
        <SquareCardForm
          applicationId={squareApplicationId}
          locationId={squareLocationId}
          env={env}
          onReady={() => (isCardReady.value = true)}
          onTokenizeRef={(fn) => {
            tokenizeRef.current = fn;
          }}
          afterCardContent={
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isButtonDisabled.value}
              style={{
                width: '100%',
                padding: '14px 24px',
                fontSize: '16px',
                fontWeight: 600,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: '#D5D6C8',
                backgroundColor: isButtonDisabled.value ? '#8a7b6e' : '#4A3728',
                border: 'none',
                borderRadius: '8px',
                cursor: isButtonDisabled.value ? 'not-allowed' : 'pointer',
                opacity: isButtonDisabled.value ? 0.7 : 1,
                transition: 'background-color 0.2s, opacity 0.2s',
                letterSpacing: '0.02em',
              }}
            >
              {isSubmitting.value
                ? 'Processing...'
                : `Register & Pay ${costBreakdown.value ? `$${(costBreakdown.value.totalCents / 100).toFixed(2)}` : ''}`}
            </button>
          }
        />
      </Box>
    </Box>
  );
}
