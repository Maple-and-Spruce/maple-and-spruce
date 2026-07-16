/**
 * Music Together Manage Widget — self-service payment-method update.
 *
 * For installment families: replace the card on file that will be charged for
 * the Week-5 second installment. Two modes, decided by a `?token=` magic-link
 * param:
 *   • no token → email form → requestMusicTogetherManageLink (we email a link)
 *   • token    → startMusicTogetherManageSession → enter a new card → save
 *
 * The magic-link token is exchanged once on mount for a short-lived session
 * token, held in memory and passed on the update call. No customer auth.
 *
 * NOTE: SquareCardForm is intentionally rendered WITHOUT an `env` prop — the
 * Square SDK environment follows the App ID prefix (MT's Square account), so
 * we can pair prod data with a sandbox App ID for testing.
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
import type {
  RequestMusicTogetherManageLinkRequest,
  RequestMusicTogetherManageLinkResponse,
  StartMusicTogetherManageSessionRequest,
  StartMusicTogetherManageSessionResponse,
  UpdateMusicTogetherPaymentMethodRequest,
  UpdateMusicTogetherPaymentMethodResponse,
  MusicTogetherManageView,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';

type Mode = 'request' | 'loading' | 'manage' | 'linkSent' | 'done' | 'error';

export interface MusicTogetherManageWidgetProps {
  /** MT Square App ID — its prefix selects the Square SDK environment. */
  squareAppId: string;
  /** MT Square location ID (must match squareAppId's environment). */
  squareLocationId: string;
  /** Firebase env for the callable functions ('dev' | 'prod'). */
  env: string;
  /** Override the magic-link token (defaults to reading `?token=` from the URL). */
  token?: string;
}

function tokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('token');
}

export function MusicTogetherManageWidget({
  squareAppId,
  squareLocationId,
  env,
  token,
}: MusicTogetherManageWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);
  const magicToken = useMemo(() => token ?? tokenFromUrl(), [token]);

  const [mode, setMode] = useState<Mode>(magicToken ? 'loading' : 'request');
  const [error, setError] = useState<string | null>(null);
  const [registration, setRegistration] =
    useState<MusicTogetherManageView | null>(null);
  const [newCardLast4, setNewCardLast4] = useState<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  // Request-link form
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // Save-card sub-flow
  const [cardReady, setCardReady] = useState(false);
  const tokenizeRef = useRef<(() => Promise<string>) | null>(null);

  // Exchange the magic-link token for a session on mount.
  useEffect(() => {
    if (!magicToken) return;
    let cancelled = false;
    (async () => {
      try {
        const call = httpsCallable<
          StartMusicTogetherManageSessionRequest,
          StartMusicTogetherManageSessionResponse
        >(functions, 'startMusicTogetherManageSession');
        const res = await call({ token: magicToken });
        if (cancelled) return;
        sessionTokenRef.current = res.data.sessionToken;
        setRegistration(res.data.registration);
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
          RequestMusicTogetherManageLinkRequest,
          RequestMusicTogetherManageLinkResponse
        >(functions, 'requestMusicTogetherManageLink');
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

  const handleSaveCard = useCallback(async () => {
    if (!sessionTokenRef.current || !tokenizeRef.current) return;
    setError(null);
    setBusy(true);
    try {
      const nonce = await tokenizeRef.current();
      const call = httpsCallable<
        UpdateMusicTogetherPaymentMethodRequest,
        UpdateMusicTogetherPaymentMethodResponse
      >(functions, 'updateMusicTogetherPaymentMethod');
      const res = await call({
        sessionToken: sessionTokenRef.current,
        paymentNonce: nonce,
      });
      setRegistration(res.data.registration);
      setNewCardLast4(res.data.cardLast4 ?? null);
      setMode('done');
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

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Update your Music Together payment method
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
              Enter the email you registered with and we&apos;ll send you a
              secure link to update the card on file for your installment plan.
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
            If that email has an installment registration, a secure link is on
            its way. Check your inbox (and spam) — the link expires in 30
            minutes.
          </Alert>
        )}

        {mode === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Token exchanged → enter a new card */}
        {mode === 'manage' && registration && (
          <Stack spacing={2}>
            <Alert severity="info">
              {registration.sectionName}
              {registration.nextInstallment
                ? ` — your next installment of ${registration.nextInstallment.amountLabel} on ${registration.nextInstallment.dueLabel} will use the new card.`
                : ' — enter a new card below to keep on file.'}
            </Alert>
            <Divider />
            <Typography variant="subtitle2">New payment method</Typography>
            <SquareCardForm
              applicationId={squareAppId}
              locationId={squareLocationId}
              totalCents={registration.nextInstallment?.amountCents ?? 0}
              onReady={() => setCardReady(true)}
              onTokenizeRef={(fn) => {
                tokenizeRef.current = fn;
              }}
              afterCardContent={
                <Button
                  variant="contained"
                  onClick={handleSaveCard}
                  disabled={busy || !cardReady}
                >
                  {busy ? 'Saving…' : 'Save new card'}
                </Button>
              }
            />
          </Stack>
        )}

        {mode === 'done' && registration && (
          <Alert severity="success">
            Your card was updated{newCardLast4 ? ` (ending ${newCardLast4})` : ''}.
            {registration.nextInstallment
              ? ` Your ${registration.nextInstallment.amountLabel} installment on ${registration.nextInstallment.dueLabel} will use it.`
              : ''}
          </Alert>
        )}
      </Box>
    </ThemeProvider>
  );
}
