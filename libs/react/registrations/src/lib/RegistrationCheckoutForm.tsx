'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { SquareCardForm } from './SquareCardForm';
import { CostSummary } from './CostSummary';
import type { PublicClass } from '@maple/ts/domain';
import type {
  CalculateRegistrationCostResponse,
  CreateRegistrationResponse,
} from '@maple/ts/firebase/api-types';

interface RegistrationCheckoutFormProps {
  publicClass: PublicClass;
  squareApplicationId: string;
  squareLocationId: string;
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
  onSuccess: (confirmationNumber: string) => void;
}

export function RegistrationCheckoutForm({
  publicClass,
  squareApplicationId,
  squareLocationId,
  onCalculateCost,
  onSubmit,
  onSuccess,
}: RegistrationCheckoutFormProps) {
  // Customer info
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [discountCode, setDiscountCode] = useState('');
  const [notes, setNotes] = useState('');

  // Cost state
  const [costBreakdown, setCostBreakdown] =
    useState<CalculateRegistrationCostResponse | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [discountApplied, setDiscountApplied] = useState(false);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCardReady, setIsCardReady] = useState(false);

  // Tokenize ref from SquareCardForm
  const tokenizeRef = useRef<(() => Promise<string>) | null>(null);

  // Calculate initial cost on mount
  useEffect(() => {
    calculateCost(quantity, '');
  }, []);

  const calculateCost = useCallback(
    async (qty: number, code: string) => {
      setIsCalculating(true);
      try {
        const result = await onCalculateCost(
          publicClass.id,
          qty,
          code || undefined
        );
        setCostBreakdown(result);
        setDiscountApplied(!!result.discountAmountCents && result.discountAmountCents > 0);
      } catch (error) {
        console.error('Failed to calculate cost:', error);
      } finally {
        setIsCalculating(false);
      }
    },
    [publicClass.id, onCalculateCost]
  );

  const handleQuantityChange = useCallback(
    (newQuantity: number) => {
      const qty = Math.max(1, Math.min(10, newQuantity));
      setQuantity(qty);
      calculateCost(qty, discountCode);
    },
    [discountCode, calculateCost]
  );

  const handleApplyDiscount = useCallback(() => {
    if (discountCode.trim()) {
      calculateCost(quantity, discountCode.trim());
    }
  }, [quantity, discountCode, calculateCost]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);

    // Basic validation
    if (!customerName.trim()) {
      setSubmitError('Please enter your name');
      return;
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      setSubmitError('Please enter a valid email address');
      return;
    }

    if (!tokenizeRef.current) {
      setSubmitError('Payment form not ready. Please wait and try again.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Tokenize the card
      const nonce = await tokenizeRef.current();

      // Submit registration
      const result = await onSubmit({
        classId: publicClass.id,
        customerEmail: customerEmail.trim(),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        quantity,
        discountCode: discountCode.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentNonce: nonce,
      });

      onSuccess(result.confirmationNumber);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Registration failed. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
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
  ]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {submitError && (
        <Alert severity="error" onClose={() => setSubmitError(null)}>
          {submitError}
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
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Email Address"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            required
            fullWidth
            helperText="Confirmation will be sent to this address"
          />
          <TextField
            label="Phone Number (optional)"
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            fullWidth
          />
          <TextField
            label="Number of Spots"
            type="number"
            value={quantity}
            onChange={(e) => handleQuantityChange(Number(e.target.value))}
            inputProps={{ min: 1, max: Math.min(10, publicClass.spotsRemaining) }}
            fullWidth
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            fullWidth
            placeholder="Dietary restrictions, accessibility needs, etc."
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
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
            size="small"
            sx={{ flex: 1 }}
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />
          <Button
            variant="outlined"
            onClick={handleApplyDiscount}
            disabled={!discountCode.trim() || isCalculating}
          >
            {isCalculating ? <CircularProgress size={20} /> : 'Apply'}
          </Button>
        </Box>
        {discountApplied && costBreakdown?.discountDescription && (
          <Alert severity="success" sx={{ mt: 1 }}>
            {costBreakdown.discountDescription} applied!
          </Alert>
        )}
      </Box>

      {/* Cost Summary */}
      {costBreakdown && (
        <CostSummary
          originalCostCents={costBreakdown.originalCostCents}
          discountAmountCents={costBreakdown.discountAmountCents}
          finalCostCents={costBreakdown.finalCostCents}
          discountDescription={costBreakdown.discountDescription}
          quantity={quantity}
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
          onReady={() => setIsCardReady(true)}
          onTokenizeRef={(fn) => {
            tokenizeRef.current = fn;
          }}
        />
      </Box>

      {/* Submit Button */}
      <Button
        variant="contained"
        size="large"
        onClick={handleSubmit}
        disabled={isSubmitting || !isCardReady}
        fullWidth
        sx={{ py: 1.5 }}
      >
        {isSubmitting ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} color="inherit" />
            Processing...
          </Box>
        ) : (
          `Register & Pay ${costBreakdown ? `$${(costBreakdown.finalCostCents / 100).toFixed(2)}` : ''}`
        )}
      </Button>
    </Box>
  );
}
