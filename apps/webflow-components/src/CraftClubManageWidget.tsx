/**
 * Craft Club Manage Widget — self-service membership management.
 *
 * Two modes, decided by whether a `?token=` magic-link param is present:
 *   • no token  → email form → requestCraftClubManageLink (we email a link)
 *   • token     → startCraftClubSession → manage view (status, cancel, change card)
 *
 * The magic-link token is exchanged once on mount for a short-lived session
 * token, held in memory and passed on every management call. No customer auth.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  TextField,
  Stack,
  Divider,
  ThemeProvider,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { theme } from '@maple/react/theme';
import { SquareCardForm } from '@maple/react/registrations';
import type { CardTokenizeResult } from '@maple/react/registrations';
import {
  CRAFT_CLUB_MONTHLY_PRICE_CENTS,
  type CraftClubMemberPublicView,
} from '@maple/ts/domain';
import type {
  RequestCraftClubManageLinkRequest,
  RequestCraftClubManageLinkResponse,
  StartCraftClubSessionRequest,
  StartCraftClubSessionResponse,
  CancelCraftClubSubscriptionRequest,
  CancelCraftClubSubscriptionResponse,
  UpdateCraftClubPaymentMethodRequest,
  UpdateCraftClubPaymentMethodResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';

type Mode = 'request' | 'loading' | 'manage' | 'linkSent' | 'error';

export interface CraftClubManageWidgetProps {
  squareAppId: string;
  squareLocationId: string;
  env: string;
  /** Override the magic-link token (defaults to reading `?token=` from the URL). */
  token?: string;
}

const MONTHLY_PRICE = (CRAFT_CLUB_MONTHLY_PRICE_CENTS / 100).toFixed(2);

function tokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('token');
}

function formatDate(date?: Date | string): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
}

export function CraftClubManageWidget({
  squareAppId,
  squareLocationId,
  env,
  token,
}: CraftClubManageWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);
  const magicToken = useMemo(() => token ?? tokenFromUrl(), [token]);

  const [mode, setMode] = useState<Mode>(magicToken ? 'loading' : 'request');
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<CraftClubMemberPublicView | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  // Request-link form
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // Change-card sub-flow
  const [changingCard, setChangingCard] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const tokenizeRef = useRef<(() => Promise<CardTokenizeResult>) | null>(null);

  // Exchange the magic-link token for a session on mount.
  useEffect(() => {
    if (!magicToken) return;
    let cancelled = false;
    (async () => {
      try {
        const call = httpsCallable<
          StartCraftClubSessionRequest,
          StartCraftClubSessionResponse
        >(functions, 'startCraftClubSession');
        const res = await call({ token: magicToken });
        if (cancelled) return;
        sessionTokenRef.current = res.data.sessionToken;
        setMember(res.data.member);
        setMode('manage');
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'This link is invalid or has expired.'
        );
        setMode('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [functions, magicToken]);

  const handleRequestLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const call = httpsCallable<
          RequestCraftClubManageLinkRequest,
          RequestCraftClubManageLinkResponse
        >(functions, 'requestCraftClubManageLink');
        await call({ email: email.trim() });
        setMode('linkSent');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [functions, email]
  );

  const handleCancel = useCallback(async () => {
    if (!sessionTokenRef.current) return;
    setError(null);
    setBusy(true);
    try {
      const call = httpsCallable<
        CancelCraftClubSubscriptionRequest,
        CancelCraftClubSubscriptionResponse
      >(functions, 'cancelCraftClubSubscription');
      const res = await call({ sessionToken: sessionTokenRef.current });
      setMember(res.data.member);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not cancel your membership.'
      );
    } finally {
      setBusy(false);
    }
  }, [functions]);

  const handleSaveCard = useCallback(async () => {
    if (!sessionTokenRef.current || !tokenizeRef.current) return;
    setError(null);
    setBusy(true);
    try {
      const { nonce, verificationToken } = await tokenizeRef.current();
      const call = httpsCallable<
        UpdateCraftClubPaymentMethodRequest,
        UpdateCraftClubPaymentMethodResponse
      >(functions, 'updateCraftClubPaymentMethod');
      const res = await call({
        sessionToken: sessionTokenRef.current,
        paymentNonce: nonce,
        cardVerificationToken: verificationToken,
      });
      setMember(res.data.member);
      setChangingCard(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not update your payment method.'
      );
    } finally {
      setBusy(false);
    }
  }, [functions]);

  const isActive =
    member?.status === 'active' || member?.status === 'past_due';

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Manage your Craft Club membership
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* No token → ask for the email to send a link */}
        {mode === 'request' && (
          <Box component="form" onSubmit={handleRequestLink}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter your email and we&apos;ll send you a secure link to manage
              your membership.
            </Typography>
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
              <Button type="submit" variant="contained" disabled={busy}>
                {busy ? 'Sending…' : 'Email me a link'}
              </Button>
            </Stack>
          </Box>
        )}

        {mode === 'linkSent' && (
          <Alert severity="success">
            If that email has a membership, a secure link is on its way. Check
            your inbox (and spam) — the link expires in 30 minutes.
          </Alert>
        )}

        {mode === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Token exchanged → manage view */}
        {mode === 'manage' && member && (
          <Stack spacing={2}>
            <MembershipStatus member={member} monthlyPrice={MONTHLY_PRICE} />

            {isActive && !changingCard && (
              <Stack spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => setChangingCard(true)}
                  disabled={busy}
                >
                  Change payment method
                </Button>
                <Button
                  variant="text"
                  color="error"
                  onClick={handleCancel}
                  disabled={busy}
                >
                  {busy ? 'Working…' : 'Cancel membership'}
                </Button>
              </Stack>
            )}

            {isActive && changingCard && (
              <>
                <Divider />
                <Typography variant="subtitle2">
                  New payment method
                </Typography>
                <SquareCardForm
                  applicationId={squareAppId}
                  locationId={squareLocationId}
                  env={env}
                  totalCents={CRAFT_CLUB_MONTHLY_PRICE_CENTS}
                  // Vaulting the replacement card needs a STORE-intent
                  // verifyBuyer token (real Square requirement for cards on
                  // file).
                  verifyBuyerForStore
                  billingContact={{ givenName: member.name, email: member.email }}
                  onReady={() => setCardReady(true)}
                  onTokenizeRef={(fn) => {
                    tokenizeRef.current = fn;
                  }}
                  afterCardContent={
                    <Stack spacing={1}>
                      <Button
                        variant="contained"
                        onClick={handleSaveCard}
                        disabled={busy || !cardReady}
                      >
                        {busy ? 'Saving…' : 'Save new card'}
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => setChangingCard(false)}
                        disabled={busy}
                      >
                        Keep current card
                      </Button>
                    </Stack>
                  }
                />
              </>
            )}
          </Stack>
        )}
      </Box>
    </ThemeProvider>
  );
}

function MembershipStatus({
  member,
  monthlyPrice,
}: {
  member: CraftClubMemberPublicView;
  monthlyPrice: string;
}) {
  const periodEnd = formatDate(member.currentPeriodEndsAt);
  switch (member.status) {
    case 'active':
      return (
        <Alert severity="success">
          Your membership is active at ${monthlyPrice}/month.
          {periodEnd && ` Next billing date: ${periodEnd}.`}
        </Alert>
      );
    case 'past_due':
      return (
        <Alert severity="warning">
          Your last payment didn&apos;t go through. Update your payment method
          below to keep your membership active.
        </Alert>
      );
    case 'cancelled':
      return (
        <Alert severity="info">
          Your membership is cancelled.
          {periodEnd && ` You have access through ${periodEnd}.`}
        </Alert>
      );
    case 'paused':
      return (
        <Alert severity="info">
          Your membership is paused. Contact us to resume it.
        </Alert>
      );
    default:
      return (
        <Alert severity="info">
          You don&apos;t have an active Craft Club membership.
        </Alert>
      );
  }
}
