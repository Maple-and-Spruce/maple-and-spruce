/**
 * Cancel Registration Widget: the website's /cancel page.
 *
 * A customer types their confirmation number and the email they booked with
 * (the confirmation page and email link here with `?confirmation=` filled in).
 *
 * - Before the free cancellation date (two weeks before the class): the class,
 *   the date, and "Request cancellation". That records a request and emails
 *   Katie; she cancels and refunds by hand. Nothing is refunded here.
 * - After it: the class and how to reach Katie, and not a word about
 *   cancelling. People can still ask her through the usual channels.
 * - No match: a neutral "couldn't find it" that reveals nothing.
 *
 * Class registrations only. Music Together has its own manage page.
 */
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Link,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import { httpsCallable } from 'firebase/functions';
import { theme } from '@maple/react/theme';
import { FreeCancellationNote } from '@maple/react/registrations';
import {
  formatFreeCancellationDeadline,
  normalizeConfirmationNumber,
} from '@maple/ts/domain';
import type {
  LookupRegistrationForCancellationRequest,
  LookupRegistrationForCancellationResponse,
  RequestRegistrationCancellationRequest,
  RequestRegistrationCancellationResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions, routeCallable } from './firebase-init';

const KATIE_EMAIL = 'katie@mapleandsprucefolkarts.com';

export interface CancelRegistrationWidgetProps {
  /** Firebase env for the callable functions ('dev' | 'prod' | 'emulator'). */
  env: string;
  /** Override the confirmation number (defaults to `?confirmation=`). */
  confirmationNumber?: string;
}

type Found = Extract<LookupRegistrationForCancellationResponse, { found: true }>;

type View =
  | { status: 'form' }
  | { status: 'looking' }
  | { status: 'notFound' }
  | { status: 'found'; registration: Found }
  | { status: 'requesting'; registration: Found }
  | { status: 'requested'; registration: Found; deadline: string };

function confirmationFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('confirmation') ?? '';
}

function formatStartsAt(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(new Date(iso));
}

function ContactKatie({ children }: { children: string }) {
  return (
    <Typography variant="body2" color="textSecondary">
      {children}{' '}
      <Link href={`mailto:${KATIE_EMAIL}`} color="primary">
        {KATIE_EMAIL}
      </Link>{' '}
      or call <Link href="tel:+13043144506">304-314-4506</Link>.
    </Typography>
  );
}

export function CancelRegistrationWidget({
  env,
  confirmationNumber: confirmationProp,
}: CancelRegistrationWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);
  const [confirmation, setConfirmation] = useState(
    () => confirmationProp ?? confirmationFromUrl()
  );
  const [email, setEmail] = useState('');
  const [view, setView] = useState<View>({ status: 'form' });
  const [error, setError] = useState<string | null>(null);

  const canLookUp = confirmation.trim().length > 0 && email.trim().length > 0;

  const handleLookup = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!canLookUp) return;
      setError(null);
      setView({ status: 'looking' });
      try {
        const lookup = routeCallable<
          LookupRegistrationForCancellationRequest,
          LookupRegistrationForCancellationResponse
        >(functions, 'publicSite', 'lookupRegistrationForCancellation');
        const { data } = await lookup({
          confirmationNumber: normalizeConfirmationNumber(confirmation),
          email: email.trim(),
        });
        setView(
          data.found
            ? { status: 'found', registration: data }
            : { status: 'notFound' }
        );
      } catch {
        setError('Something went wrong looking that up. Please try again.');
        setView({ status: 'form' });
      }
    },
    [canLookUp, confirmation, email, functions]
  );

  const handleRequest = useCallback(
    async (registration: Found) => {
      setError(null);
      setView({ status: 'requesting', registration });
      try {
        const request = httpsCallable<
          RequestRegistrationCancellationRequest,
          RequestRegistrationCancellationResponse
        >(functions, 'requestRegistrationCancellation');
        const { data } = await request({
          confirmationNumber: normalizeConfirmationNumber(confirmation),
          email: email.trim(),
        });
        setView({
          status: 'requested',
          registration,
          deadline: data.freeCancellationUntil,
        });
      } catch {
        setError(
          `We could not send your request. Please email ${KATIE_EMAIL} with your confirmation number.`
        );
        setView({ status: 'found', registration });
      }
    },
    [confirmation, email, functions]
  );

  const startOver = () => {
    setError(null);
    setView({ status: 'form' });
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ width: '100%', maxWidth: 520, mx: 'auto' }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {(view.status === 'form' || view.status === 'looking') && (
          <Box component="form" onSubmit={handleLookup} noValidate>
            <Typography variant="h6" gutterBottom>
              Find your registration
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Your confirmation number is in your confirmation email and starts
              with MS-.
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Confirmation number"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="MS-XXXXXX"
                autoComplete="off"
                required
                fullWidth
                slotProps={{ htmlInput: { 'aria-label': 'Confirmation number' } }}
              />
              <TextField
                label="Email you registered with"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                fullWidth
                slotProps={{ htmlInput: { 'aria-label': 'Email you registered with' } }}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={!canLookUp || view.status === 'looking'}
                startIcon={
                  view.status === 'looking' ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : undefined
                }
              >
                {view.status === 'looking' ? 'Looking…' : 'Find registration'}
              </Button>
            </Stack>
          </Box>
        )}

        {view.status === 'notFound' && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              We couldn&apos;t find a registration with that confirmation
              number and email. Check both against your confirmation email.
            </Alert>
            <Box sx={{ mb: 2 }}>
              <ContactKatie>Still stuck? Reach Katie at</ContactKatie>
            </Box>
            <Button variant="outlined" onClick={startOver}>
              Try again
            </Button>
          </Box>
        )}

        {(view.status === 'found' || view.status === 'requesting') && (
          <Box>
            <Typography variant="h6">{view.registration.className}</Typography>
            {view.registration.startsAt && (
              <Typography variant="body1" color="textSecondary" sx={{ mb: 2 }}>
                {formatStartsAt(view.registration.startsAt)}
              </Typography>
            )}

            {view.registration.cancellationRequested ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                Your cancellation request is with Katie. She will email you
                when your refund is on its way.
              </Alert>
            ) : view.registration.freeCancellationUntil ? (
              <>
                <FreeCancellationNote
                  variant="checkout"
                  deadline={new Date(view.registration.freeCancellationUntil)}
                />
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  disabled={view.status === 'requesting'}
                  onClick={() => handleRequest(view.registration)}
                  sx={{ mb: 2 }}
                  startIcon={
                    view.status === 'requesting' ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : undefined
                  }
                >
                  {view.status === 'requesting'
                    ? 'Sending…'
                    : 'Request cancellation'}
                </Button>
              </>
            ) : null}

            <ContactKatie>Questions about your registration? Reach Katie at</ContactKatie>
          </Box>
        )}

        {view.status === 'requested' && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircleOutlineIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              Request sent
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              You asked before {formatFreeCancellationDeadline(new Date(view.deadline))},
              so you will get a full refund for {view.registration.className}.
              Katie will cancel it and email you when the refund is on its way.
            </Typography>
            <ContactKatie>Changed your mind? Reach Katie at</ContactKatie>
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
