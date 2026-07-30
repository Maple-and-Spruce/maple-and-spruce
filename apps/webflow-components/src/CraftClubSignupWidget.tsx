/**
 * Craft Club Signup Widget — self-contained membership signup component.
 *
 * Designed for embedding in Webflow via Code Components. Drives the
 * approved-only signup flow:
 *   enter email → checkCraftClubEligibility →
 *     • approved  → collect name + card → createCraftClubSubscription
 *     • active    → "you're already a member" + manage link
 *     • requested → "your request is pending approval"
 *     • unknown   → request-access form → requestCraftClubAccess
 *
 * No Next.js dependencies — Firebase is initialized explicitly from the `env`
 * prop (see firebase-init.ts).
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  TextField,
  Stack,
  Link,
  ThemeProvider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { httpsCallable } from 'firebase/functions';
import { theme, fonts } from '@maple/react/theme';
import { SquareCardForm } from '@maple/react/registrations';
import type { CardTokenizeResult } from '@maple/react/registrations';
import { CRAFT_CLUB_MONTHLY_PRICE_CENTS } from '@maple/ts/domain';
import type {
  CheckCraftClubEligibilityRequest,
  CheckCraftClubEligibilityResponse,
  CreateCraftClubSubscriptionRequest,
  CreateCraftClubSubscriptionResponse,
  RequestCraftClubAccessRequest,
  RequestCraftClubAccessResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';
import { warmup } from './lib/warmup';

type Step =
  | 'enterEmail'
  | 'approved' // collect name + card
  | 'active' // already a member
  | 'requested' // pending approval (pre-existing or just submitted)
  | 'unknown' // offer request-access form
  | 'success'; // subscribed

export interface CraftClubSignupWidgetProps {
  /** Square application ID (sandbox or production). */
  squareAppId: string;
  /** Square location ID. */
  squareLocationId: string;
  /** 'dev' | 'prod' | 'emulator' — selects Firebase project + Square SDK. */
  env: string;
  /** URL of the public "manage my membership" page (for existing members). */
  manageUrl: string;
}

const MONTHLY_PRICE = (CRAFT_CLUB_MONTHLY_PRICE_CENTS / 100).toFixed(2);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CraftClubSignupWidget({
  squareAppId,
  squareLocationId,
  env,
  manageUrl,
}: CraftClubSignupWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);

  // Warm the eligibility check the family triggers seconds after landing.
  useEffect(() => {
    warmup(functions, 'checkCraftClubEligibility');
  }, [functions]);

  const [step, setStep] = useState<Step>('enterEmail');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const tokenizeRef = useRef<(() => Promise<CardTokenizeResult>) | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const payDisabled = busy || !cardReady || !name.trim();

  const handleCheckEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const call = httpsCallable<
          CheckCraftClubEligibilityRequest,
          CheckCraftClubEligibilityResponse
        >(functions, 'checkCraftClubEligibility');
        const res = await call({ email: email.trim() });
        // Warm the subscribe function — the user is about to need it.
        if (res.data.status === 'approved') {
          warmup(functions, 'createCraftClubSubscription');
        }
        setStep(res.data.status);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Something went wrong.'
        );
      } finally {
        setBusy(false);
      }
    },
    [functions, email]
  );

  const handlePay = useCallback(async () => {
    if (!tokenizeRef.current) return;
    setError(null);
    setBusy(true);
    try {
      const { nonce, verificationToken } = await tokenizeRef.current();
      const call = httpsCallable<
        CreateCraftClubSubscriptionRequest,
        CreateCraftClubSubscriptionResponse
      >(functions, 'createCraftClubSubscription');
      await call({
        email: email.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        paymentNonce: nonce,
        cardVerificationToken: verificationToken,
      });
      setStep('success');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'We could not start your membership. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }, [functions, email, name, phone]);

  const handleRequestAccess = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const call = httpsCallable<
          RequestCraftClubAccessRequest,
          RequestCraftClubAccessResponse
        >(functions, 'requestCraftClubAccess');
        await call({
          email: email.trim(),
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
        });
        setStep('requested');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Something went wrong.'
        );
      } finally {
        setBusy(false);
      }
    },
    [functions, email, name, phone]
  );

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Join the Craft Club
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          ${MONTHLY_PRICE}/month for studio access during Craft Club hours.
          Materials are billed separately at checkout. Cancel anytime.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Step 1 — enter email */}
        {step === 'enterEmail' && (
          <Box component="form" onSubmit={handleCheckEmail}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                autoFocus
              />
              <Button
                type="submit"
                variant="contained"
                disabled={busy || !emailValid}
              >
                {busy ? 'Checking…' : 'Continue'}
              </Button>
            </Stack>
          </Box>
        )}

        {/* Step 2a — approved: collect name + card, then pay */}
        {step === 'approved' && (
          <Stack spacing={2}>
            <Alert severity="success">
              You&apos;re approved! Set up your ${MONTHLY_PRICE}/month
              membership below.
            </Alert>
            <TextField
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />
            <SquareCardForm
              applicationId={squareAppId}
              locationId={squareLocationId}
              env={env}
              totalCents={CRAFT_CLUB_MONTHLY_PRICE_CENTS}
              maxWidth={480}
              // The subscription vaults this card on file — real Square needs a
              // STORE-intent verifyBuyer token to do so.
              verifyBuyerForStore
              billingContact={{ givenName: name.trim(), email: email.trim() }}
              onReady={() => setCardReady(true)}
              onTokenizeRef={(fn) => {
                tokenizeRef.current = fn;
              }}
              afterCardContent={
                // Native button with inline brand styling. In Shadow DOM this
                // content is portaled to the light DOM, where MUI/emotion theme
                // CSS can't reach it (an MUI <Button> renders unstyled/gray).
                // Mirrors RegistrationCheckoutForm's submit button.
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={payDisabled}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    fontSize: '16px',
                    fontWeight: 600,
                    fontFamily: fonts.button,
                    color: '#D5D6C8',
                    backgroundColor: payDisabled ? '#8a7b6e' : '#4A3728',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: payDisabled ? 'not-allowed' : 'pointer',
                    opacity: payDisabled ? 0.7 : 1,
                    transition: 'background-color 0.2s, opacity 0.2s',
                    letterSpacing: '0.02em',
                  }}
                >
                  {busy
                    ? 'Starting membership…'
                    : `Subscribe — $${MONTHLY_PRICE}/month`}
                </button>
              }
            />
          </Stack>
        )}

        {/* Step 2b — already an active member */}
        {step === 'active' && (
          <Alert severity="info">
            You already have an active Craft Club membership.{' '}
            <Link href={manageUrl}>Manage your membership</Link>.
          </Alert>
        )}

        {/* Step 2c — request already pending */}
        {step === 'requested' && (
          <Alert severity="info">
            Thanks! Your request is pending approval — we&apos;ll email you
            when you&apos;re approved to join.
          </Alert>
        )}

        {/* Step 2d — unknown email: offer to request access */}
        {step === 'unknown' && (
          <Box component="form" onSubmit={handleRequestAccess}>
            <Stack spacing={2}>
              <Alert severity="info">
                This email isn&apos;t on the approved list yet. Request access
                and we&apos;ll be in touch.
              </Alert>
              <TextField
                label="Full name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
              />
              <TextField
                label="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
              />
              <Button type="submit" variant="contained" disabled={busy}>
                {busy ? 'Submitting…' : 'Request access'}
              </Button>
            </Stack>
          </Box>
        )}

        {/* Step 3 — subscribed */}
        {step === 'success' && (
          <Stack spacing={1} alignItems="center" sx={{ py: 2 }}>
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48 }} />
            <Typography variant="h6">You&apos;re in!</Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
            >
              Your ${MONTHLY_PRICE}/month Craft Club membership is active.
              You can manage or cancel it anytime at{' '}
              <Link href={manageUrl}>your membership page</Link>.
            </Typography>
          </Stack>
        )}

        {busy && step === 'enterEmail' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
