'use client';

import { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  IconButton,
  Link,
} from '@mui/material';
import {
  useSignal,
  useComputed,
  useSignals,
  batch,
} from '@maple/react/signals';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { fonts } from '@maple/react/theme';
import { SquareCardForm } from './SquareCardForm';
import { CostSummary } from './CostSummary';
import { SigningForm } from '@maple/react/agreements';
import type {
  PublicClass,
  AgreementSection,
  Attendee,
} from '@maple/ts/domain';
import type {
  CalculateRegistrationCostResponse,
  CreateRegistrationResponse,
  InlineAgreementSigningData,
} from '@maple/ts/firebase/api-types';
import { registrationValidation } from '@maple/ts/validation';
import { formatPhoneNumber } from './formatPhoneNumber';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * UI-side attendee row. `nameRevealed` and `sendConfirmation` are pure UI
 * state — they decide whether the name field and email field are shown. The
 * domain payload only carries `name` and `email` when the user filled them.
 */
interface AttendeeRow {
  nameRevealed: boolean;
  sendConfirmation: boolean;
  name: string;
  email: string;
}

/** Template summary returned by getRequiredAgreementsForClass */
export interface RequiredAgreementTemplate {
  templateId: string;
  templateName: string;
  sections: AgreementSection[];
  supportsMinor: boolean;
}

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
  /** URL of the Apple Pay checkout page hosted on a domain verified for Apple Pay */
  applePayCheckoutUrl?: string;
  /** Whether to show digital wallet buttons (Apple Pay / Google Pay). Default false. */
  showDigitalWallets?: boolean;
  /** Required agreements that must be signed before checkout */
  requiredAgreements?: RequiredAgreementTemplate[];
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
    additionalAttendees?: Attendee[];
    discountCode?: string;
    notes?: string;
    paymentNonce: string;
    agreements?: InlineAgreementSigningData[];
  }) => Promise<CreateRegistrationResponse>;
  onSuccess: (details: {
    confirmationNumber: string;
    customerName: string;
    customerEmail: string;
    pricePaidCents: number;
    quantity: number;
    agreementsSigned?: boolean;
  }) => void;
}

export function RegistrationCheckoutForm({
  publicClass,
  squareApplicationId,
  squareLocationId,
  env,
  applePayCheckoutUrl,
  showDigitalWallets = false,
  requiredAgreements = [],
  onCalculateCost,
  onSubmit,
  onSuccess,
}: RegistrationCheckoutFormProps) {
  useSignals();

  // Customer info
  const customerName = useSignal('');
  const customerEmail = useSignal('');
  const customerPhone = useSignal('');
  const additionalAttendees = useSignal<AttendeeRow[]>([]);
  const discountCode = useSignal('');
  const notes = useSignal('');

  // Quantity is derived: registrant + extras. Kept as a computed so all the
  // existing pricing/capacity code that reads `quantity.value` still works.
  const quantity = useComputed(() => 1 + additionalAttendees.value.length);

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

  // Agreement signing state — tracks completed inline signatures
  const signedAgreements = useSignal<Map<string, InlineAgreementSigningData>>(
    new Map()
  );
  const currentAgreementIndex = useSignal(0);
  const hasRequiredAgreements = requiredAgreements.length > 0;
  const allAgreementsSigned = useComputed(
    () =>
      !hasRequiredAgreements ||
      requiredAgreements.every((a) =>
        signedAgreements.value.has(a.templateId)
      )
  );

  // Derived state — guaranteed in sync with its inputs.
  const isFull = useComputed(() => publicClass.spotsRemaining <= 0);
  const maxQuantity = useComputed(() =>
    Math.min(10, publicClass.spotsRemaining)
  );
  const discountApplied = useComputed(
    () => (costBreakdown.value?.discountAmountCents ?? 0) > 0
  );
  const isButtonDisabled = useComputed(
    () =>
      isSubmitting.value ||
      !isCardReady.value ||
      isFull.value ||
      !allAgreementsSigned.value
  );

  // ============================================================
  // VALIDATION — Vest suite wired through computed signals.
  // Note: discountCode is intentionally excluded — it's validated
  // server-side by the lookup-discount function.
  // ============================================================
  // Build the domain payload of additional attendees (names/emails only when
  // the user has actually filled them). Used for validation and for the
  // submit payload — derived once so both stay consistent.
  const additionalAttendeesPayload = useComputed<Attendee[]>(() =>
    additionalAttendees.value.map((row) => {
      const name = row.nameRevealed ? row.name.trim() : '';
      const email = row.sendConfirmation ? row.email.trim() : '';
      return {
        name: name || undefined,
        email: email || undefined,
      };
    })
  );

  const validation = useComputed(() =>
    registrationValidation({
      classId: publicClass.id,
      customerName: customerName.value,
      customerEmail: customerEmail.value,
      customerPhone: customerPhone.value || undefined,
      quantity: quantity.value,
      notes: notes.value || undefined,
      additionalAttendees: additionalAttendeesPayload.value,
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

  const handleAddAttendee = useCallback(() => {
    if (quantity.value >= maxQuantity.value) {
      const max = maxQuantity.value;
      quantityWarning.value = `Only ${max} spot${max === 1 ? '' : 's'} available for this class.`;
      return;
    }
    batch(() => {
      quantityWarning.value = null;
      additionalAttendees.value = [
        ...additionalAttendees.value,
        { nameRevealed: false, sendConfirmation: false, name: '', email: '' },
      ];
    });
    calculateCost(quantity.value + 1, discountCode.value);
  }, [
    additionalAttendees,
    calculateCost,
    discountCode,
    maxQuantity,
    quantity,
    quantityWarning,
  ]);

  const handleRemoveAttendee = useCallback(
    (index: number) => {
      batch(() => {
        quantityWarning.value = null;
        additionalAttendees.value = additionalAttendees.value.filter(
          (_, i) => i !== index
        );
      });
      calculateCost(quantity.value - 1, discountCode.value);
    },
    [additionalAttendees, calculateCost, discountCode, quantity, quantityWarning]
  );

  const handleAttendeeFieldChange = useCallback(
    (index: number, patch: Partial<AttendeeRow>) => {
      additionalAttendees.value = additionalAttendees.value.map((row, i) =>
        i === index ? { ...row, ...patch } : row
      );
    },
    [additionalAttendees]
  );

  const handleApplyDiscount = useCallback(() => {
    const code = discountCode.value.trim();
    if (code) {
      calculateCost(quantity.value, code);
    }
  }, [quantity, discountCode, calculateCost]);

  /**
   * Run the registration API call and onSuccess callback for a given nonce.
   * Assumes the caller has already flipped `isSubmitting` to true and will
   * clear it in their own finally block. Throws on backend error so the
   * caller can map it to `submitError`.
   */
  const performSubmit = useCallback(
    async (nonce: string) => {
      const agreementsData = hasRequiredAgreements
        ? Array.from(signedAgreements.value.values())
        : undefined;

      const result = await onSubmit({
        classId: publicClass.id,
        customerEmail: customerEmail.value.trim(),
        customerName: customerName.value.trim(),
        customerPhone: customerPhone.value.trim() || undefined,
        quantity: quantity.value,
        additionalAttendees:
          additionalAttendeesPayload.value.length > 0
            ? additionalAttendeesPayload.value
            : undefined,
        discountCode: discountCode.value.trim() || undefined,
        notes: notes.value.trim() || undefined,
        paymentNonce: nonce,
        agreements: agreementsData,
      });

      onSuccess({
        confirmationNumber: result.confirmationNumber,
        customerName: customerName.value.trim(),
        customerEmail: customerEmail.value.trim(),
        pricePaidCents: result.registration.pricePaidCents,
        quantity: quantity.value,
        agreementsSigned: result.agreementsSigned,
      });
    },
    [
      customerName,
      customerEmail,
      customerPhone,
      quantity,
      additionalAttendeesPayload,
      discountCode,
      notes,
      publicClass.id,
      onSubmit,
      onSuccess,
      hasRequiredAgreements,
      signedAgreements,
    ]
  );

  /**
   * Submit with a nonce that arrived from outside the card form (Google Pay
   * or Apple Pay popup). These flows don't go through `handleSubmit`, so this
   * wrapper handles the validation guard and `isSubmitting` toggle itself.
   */
  const submitWithNonce = useCallback(
    async (nonce: string) => {
      if (isSubmitting.value) return;

      showValidationErrors.value = true;
      if (!isValid.value) return;
      if (!allAgreementsSigned.value) return;

      isSubmitting.value = true;
      submitError.value = null;

      try {
        await performSubmit(nonce);
      } catch (error) {
        submitError.value = extractErrorMessage(error);
      } finally {
        isSubmitting.value = false;
      }
    },
    [
      isSubmitting,
      submitError,
      showValidationErrors,
      isValid,
      allAgreementsSigned,
      performSubmit,
    ]
  );

  const handleDigitalWalletToken = useCallback(
    (token: string) => {
      // Validate before submitting — if invalid, show errors and surface
      // a message so the user knows why nothing happened after wallet auth.
      showValidationErrors.value = true;
      if (!isValid.value || !allAgreementsSigned.value) {
        submitError.value =
          'Please complete all required fields and agreements before paying.';
        return;
      }
      submitWithNonce(token);
    },
    [submitWithNonce, showValidationErrors, isValid, allAgreementsSigned, submitError]
  );


  const handleSubmit = useCallback(async () => {
    if (isSubmitting.value) return;

    showValidationErrors.value = true;
    if (!isValid.value) return;
    if (!allAgreementsSigned.value) return;

    // Flip the submitting state BEFORE awaiting Square tokenization. The
    // tokenize call can take a noticeable moment, and without this the
    // button stays in its default state until the network round-trip
    // completes, leaving the user wondering whether their click registered.
    isSubmitting.value = true;
    submitError.value = null;

    try {
      if (!tokenizeRef.current) {
        submitError.value =
          'Payment form not ready. Please wait and try again.';
        return;
      }

      const nonce = await tokenizeRef.current();
      await performSubmit(nonce);
    } catch (error) {
      submitError.value = extractErrorMessage(error);
    } finally {
      isSubmitting.value = false;
    }
  }, [
    isSubmitting,
    submitError,
    showValidationErrors,
    isValid,
    allAgreementsSigned,
    performSubmit,
  ]);

  // ============================================================
  // APPLE PAY POPUP
  // ============================================================
  const applePayOrigin = useMemo(() => {
    if (!applePayCheckoutUrl) return null;
    try {
      return new URL(applePayCheckoutUrl).origin;
    } catch {
      return null;
    }
  }, [applePayCheckoutUrl]);

  const handleApplePayClick = useCallback((): void => {
    if (!applePayCheckoutUrl || !costBreakdown.value) return;

    // Validate customer info before opening popup
    showValidationErrors.value = true;
    if (!isValid.value) return;
    if (!allAgreementsSigned.value) return;

    const totalCents = costBreakdown.value.totalCents;
    const params = new URLSearchParams({
      amount: String(totalCents),
      applicationId: squareApplicationId,
      locationId: squareLocationId,
      label: publicClass.name,
      origin: window.location.origin,
    });

    const url = `${applePayCheckoutUrl}?${params.toString()}`;
    const width = 440;
    const height = 600;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

    window.open(
      url,
      'apple-pay-checkout',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  }, [
    applePayCheckoutUrl,
    costBreakdown,
    squareApplicationId,
    squareLocationId,
    publicClass.name,
    showValidationErrors,
    isValid,
    allAgreementsSigned,
  ]);

  // Listen for Apple Pay token messages from the popup window
  useEffect(() => {
    if (!applePayOrigin) return;

    const handler = (event: MessageEvent): void => {
      if (event.origin !== applePayOrigin) return;
      if (event.data?.type !== 'APPLE_PAY_TOKEN') return;
      if (typeof event.data.token === 'string') {
        submitWithNonce(event.data.token);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [applePayOrigin, submitWithNonce]);

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

      {/* Additional Attendees Section */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Anyone else coming with you?
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', mb: 1 }}
        >
          {isFull.value
            ? 'No spots available.'
            : `${publicClass.spotsRemaining} spot${publicClass.spotsRemaining === 1 ? '' : 's'} available — register up to ${maxQuantity.value} ${maxQuantity.value === 1 ? 'person' : 'people'} total.`}
        </Typography>

        {additionalAttendees.value.map((attendee, index) => {
          const displayLabel =
            attendee.nameRevealed && attendee.name.trim()
              ? attendee.name
              : `Additional Person #${index + 1}`;
          const emailLooksInvalid =
            attendee.sendConfirmation &&
            attendee.email.length > 0 &&
            !EMAIL_REGEX.test(attendee.email);
          return (
            <Box
              key={index}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                p: 2,
                mb: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography sx={{ fontWeight: 500 }}>{displayLabel}</Typography>
                <IconButton
                  size="small"
                  aria-label={`Remove additional person ${index + 1}`}
                  onClick={() => handleRemoveAttendee(index)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>

              {attendee.nameRevealed ? (
                <TextField
                  label="Name"
                  size="small"
                  value={attendee.name}
                  onChange={(e) =>
                    handleAttendeeFieldChange(index, { name: e.target.value })
                  }
                  fullWidth
                />
              ) : (
                <Link
                  component="button"
                  type="button"
                  variant="body2"
                  underline="hover"
                  onClick={() =>
                    handleAttendeeFieldChange(index, { nameRevealed: true })
                  }
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Update name
                </Link>
              )}

              <FormControlLabel
                control={
                  <Checkbox
                    checked={attendee.sendConfirmation}
                    onChange={(e) =>
                      handleAttendeeFieldChange(index, {
                        sendConfirmation: e.target.checked,
                      })
                    }
                  />
                }
                label="Send them a confirmation email"
              />

              {attendee.sendConfirmation && (
                <TextField
                  label="Their email address"
                  type="email"
                  size="small"
                  value={attendee.email}
                  onChange={(e) =>
                    handleAttendeeFieldChange(index, { email: e.target.value })
                  }
                  fullWidth
                  error={showValidationErrors.value && emailLooksInvalid}
                  helperText={
                    showValidationErrors.value && emailLooksInvalid
                      ? 'Please enter a valid email address'
                      : "We'll send them class details — no payment info."
                  }
                />
              )}
            </Box>
          );
        })}

        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddAttendee}
          disabled={isFull.value || quantity.value >= maxQuantity.value}
          sx={{ mt: 1 }}
        >
          Add another person
        </Button>

        {quantityWarning.value && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {quantityWarning.value}
          </Alert>
        )}
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

      {/* Required Agreements Section */}
      {hasRequiredAgreements && (
        <Box>
          <Typography variant="h6" gutterBottom>
            {requiredAgreements.length === 1
              ? 'Sign Waiver'
              : `Sign Waivers (${signedAgreements.value.size}/${requiredAgreements.length})`}
          </Typography>

          {requiredAgreements.map((agreement, index) => {
            const isSigned = signedAgreements.value.has(agreement.templateId);
            const isActive = currentAgreementIndex.value === index;

            if (isSigned) {
              return (
                <Alert
                  key={agreement.templateId}
                  severity="success"
                  icon={<CheckCircleOutlineIcon />}
                  sx={{ mb: 2 }}
                >
                  {agreement.templateName} — Signed
                </Alert>
              );
            }

            if (!isActive) {
              return (
                <Alert
                  key={agreement.templateId}
                  severity="info"
                  sx={{ mb: 2 }}
                >
                  {agreement.templateName} — Pending
                </Alert>
              );
            }

            return (
              <Box key={agreement.templateId} sx={{ mb: 2 }}>
                <SigningForm
                  templateName={agreement.templateName}
                  sections={agreement.sections}
                  supportsMinor={agreement.supportsMinor}
                  signerName={customerName.value}
                  signerEmail={customerEmail.value}
                  className={publicClass.name}
                  onSubmit={async (signingData) => {
                    const newMap = new Map(signedAgreements.value);
                    newMap.set(agreement.templateId, {
                      templateId: agreement.templateId,
                      signatureData: signingData.signatureData,
                      printedName: signingData.printedName,
                      mediaReleaseChoice: signingData.mediaReleaseChoice,
                      isMinor: signingData.isMinor,
                      minorName: signingData.minorName,
                      guardianName: signingData.guardianName,
                      guardianSignatureData: signingData.guardianSignatureData,
                    });
                    signedAgreements.value = newMap;

                    // Advance to next unsigned agreement
                    const nextIndex = requiredAgreements.findIndex(
                      (a, i) => i > index && !newMap.has(a.templateId)
                    );
                    if (nextIndex !== -1) {
                      currentAgreementIndex.value = nextIndex;
                    }
                  }}
                />
              </Box>
            );
          })}

          {!allAgreementsSigned.value && !customerName.value.trim() && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Please fill in your name and email above before signing.
            </Alert>
          )}
        </Box>
      )}

      {/* Payment Section */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Payment
        </Typography>

        {applePayCheckoutUrl && showDigitalWallets && (
          <button
            type="button"
            onClick={handleApplePayClick}
            disabled={isButtonDisabled.value}
            style={{
              backgroundColor: '#000',
              color: '#fff',
              borderRadius: 8,
              padding: '14px 24px',
              width: '100%',
              fontSize: 16,
              fontWeight: 600,
              border: 'none',
              cursor: isButtonDisabled.value ? 'not-allowed' : 'pointer',
              opacity: isButtonDisabled.value ? 0.7 : 1,
              // Apple Pay HIG: button text uses the system font, not brand fonts.
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              letterSpacing: '0.02em',
              marginBottom: 8,
            }}
          >
            {'\uF8FF'} Pay with Apple Pay
          </button>
        )}

        <SquareCardForm
          applicationId={squareApplicationId}
          locationId={squareLocationId}
          env={env}
          totalCents={costBreakdown.value?.totalCents}
          showDigitalWallets={showDigitalWallets}
          onReady={() => (isCardReady.value = true)}
          onTokenizeRef={(fn) => {
            tokenizeRef.current = fn;
          }}
          onDigitalWalletToken={handleDigitalWalletToken}
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
                fontFamily: fonts.button,
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
