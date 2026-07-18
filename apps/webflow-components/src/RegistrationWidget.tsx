/**
 * Registration Widget — self-contained class registration + payment component.
 *
 * Designed for embedding in Webflow via Code Components.
 * Reuses RegistrationCheckoutForm and related components from the existing library.
 * No Next.js dependencies — all routing/navigation is handled inline.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Divider,
  TextField,
  Stack,
  ThemeProvider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PrintIcon from '@mui/icons-material/Print';
import { httpsCallable } from 'firebase/functions';
import { theme } from '@maple/react/theme';
import { RegistrationCheckoutForm } from '@maple/react/registrations';
import type { RequiredAgreementTemplate } from '@maple/react/registrations';
import type { PublicClass } from '@maple/ts/domain';
import type {
  GetPublicClassRequest,
  GetPublicClassResponse,
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse,
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  GetRequiredAgreementsForClassRequest,
  GetRequiredAgreementsForClassResponse,
  InlineAgreementSigningData,
  GetRelatedPublicClassesRequest,
  GetRelatedPublicClassesResponse,
  AddToClassWaitlistRequest,
  AddToClassWaitlistResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';
import {
  trackAddClassToCart,
  trackPurchaseClass,
  trackViewClass,
} from './lib/class-analytics';
import { warmup } from './lib/warmup';


/**
 * Format duration in minutes to a human-readable string.
 * Examples: 60 -> "1 hour", 90 -> "1.5 hours", 120 -> "2 hours"
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${hours} hours`;
}

/**
 * Format a skill level enum value for display.
 */
function formatSkillLevel(level: string): string {
  switch (level) {
    case 'all-levels':
      return 'All Levels';
    case 'beginner':
      return 'Beginner';
    case 'intermediate':
      return 'Intermediate';
    case 'advanced':
      return 'Advanced';
    default:
      return level;
  }
}

/**
 * Format an ISO date string to a localized, readable date/time.
 */
function formatClassDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Pad a number to two digits for .ics date formatting.
 */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Convert a Date to an .ics-compatible UTC timestamp (YYYYMMDDTHHMMSSZ).
 */
function toIcsDate(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/**
 * Generate a minimal .ics calendar file as a string.
 */
function generateIcsFile(opts: {
  startDate: string;
  endDate: string;
  summary: string;
  location?: string;
  description: string;
}): string {
  const start = toIcsDate(new Date(opts.startDate));
  const end = toIcsDate(new Date(opts.endDate));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maple & Spruce//Registration//EN',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${opts.summary}`,
    ...(opts.location ? [`LOCATION:${opts.location}`] : []),
    `DESCRIPTION:${opts.description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/**
 * Format the first session date for the related-class card. Shorter than the
 * confirmation-page formatter because we only need date + time, not weekday.
 */
function formatRelatedClassDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Sold-out fallback shown when `spotsRemaining <= 0`. Loads sibling
 * classes (same category, future, available) and offers an informal
 * waitlist signup. Both pieces are independent — the waitlist form
 * still renders even if no related classes are found.
 */
function SoldOutPanel({
  classId,
  functions,
}: {
  classId: string;
  functions: ReturnType<typeof getWidgetFunctions>;
}) {
  const [related, setRelated] = useState<PublicClass[] | null>(null);
  const [email, setEmail] = useState('');
  const [waitlistState, setWaitlistState] = useState<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; alreadyOnList: boolean }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  useEffect(() => {
    const fetchRelated = async () => {
      try {
        const call = httpsCallable<
          GetRelatedPublicClassesRequest,
          GetRelatedPublicClassesResponse
        >(functions, 'getRelatedPublicClasses');
        const result = await call({ classId });
        setRelated(result.data.classes);
      } catch (err) {
        console.error('Failed to fetch related classes:', err);
        setRelated([]);
      }
    };
    fetchRelated();
  }, [classId, functions]);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setWaitlistState({
        status: 'error',
        message: 'Please enter your email.',
      });
      return;
    }
    setWaitlistState({ status: 'submitting' });
    try {
      const call = httpsCallable<
        AddToClassWaitlistRequest,
        AddToClassWaitlistResponse
      >(functions, 'addToClassWaitlist');
      const result = await call({ classId, email: trimmed });
      setWaitlistState({
        status: 'success',
        alreadyOnList: !result.data.added,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';
      setWaitlistState({ status: 'error', message });
    }
  };

  return (
    <Box>
      {/*
        Waitlist signup — the primary action for a full class, so it leads.
        On the class page the Webflow template renders its own "Join Waitlist"
        heading + "this class is full…" subtext (CMS conditional visibility)
        directly above this widget, so the panel deliberately omits a full-state
        banner and repeats none of that copy — just the first-come fine print.
      */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Spots are first-come, first-served — we email everyone on the list.
        </Typography>

        {waitlistState.status === 'success' ? (
          <Alert severity="success">
            {waitlistState.alreadyOnList
              ? "You're already on the list — we'll email you if a spot opens."
              : "You're on the list. We'll email you if a spot opens."}
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleWaitlistSubmit}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ sm: 'flex-start' }}
            >
              <TextField
                type="email"
                label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="small"
                fullWidth
                required
                disabled={waitlistState.status === 'submitting'}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={waitlistState.status === 'submitting'}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {waitlistState.status === 'submitting'
                  ? 'Joining…'
                  : 'Join waitlist'}
              </Button>
            </Stack>
            {waitlistState.status === 'error' && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {waitlistState.message}
              </Alert>
            )}
          </Box>
        )}
      </Box>

      {/* Alternative: other dates for the same class that still have spots. */}
      {related && related.length > 0 && (
        <>
          <Divider sx={{ my: 3 }} />
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              gutterBottom
              sx={{ color: 'text.primary' }}
            >
              Other upcoming dates
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              We're offering this class on other dates that still have spots.
            </Typography>
            <Stack spacing={1.5}>
              {related.map((rc) => {
                const firstSession = rc.sessions[0]?.dateTime;
                return (
                  <Box
                    key={rc.id}
                    sx={{
                      p: 2,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      justifyContent: 'space-between',
                      gap: 1.5,
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {rc.name}
                      </Typography>
                      {firstSession && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          {formatRelatedClassDate(firstSession)} ·{' '}
                          {rc.spotsRemaining} spot
                          {rc.spotsRemaining === 1 ? '' : 's'} left
                        </Typography>
                      )}
                    </Box>
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      href={`/classes/${rc.slug}`}
                    >
                      View class
                    </Button>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        </>
      )}
    </Box>
  );
}

interface RegistrationWidgetProps {
  classId: string;
  squareAppId: string;
  squareLocationId: string;
  env: string;
  applePayCheckoutUrl?: string;
  showDigitalWallets?: string;
}

type WidgetState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; publicClass: PublicClass; requiredAgreements: RequiredAgreementTemplate[] }
  | {
      status: 'confirmed';
      confirmationNumber: string;
      customerName: string;
      customerEmail: string;
      className: string;
      pricePaidCents: number;
      quantity: number;
      classDate: string;
      classEndDate: string;
      classDurationMinutes: number;
      skillLevel: string;
      location?: string;
      agreementsSigned?: boolean;
    };

export function RegistrationWidget({
  classId,
  squareAppId,
  squareLocationId,
  env,
  applePayCheckoutUrl,
  showDigitalWallets,
}: RegistrationWidgetProps) {
  const digitalWalletsEnabled = showDigitalWallets === 'show';
  const [state, setState] = useState<WidgetState>({ status: 'loading' });

  const functions = useMemo(() => getWidgetFunctions(env), [env]);

  // Fetch class details on mount
  useEffect(() => {
    if (!classId) {
      setState({ status: 'error', message: 'No class ID provided.' });
      return;
    }

    // Pre-warm downstream callables the user will hit shortly (discount
    // recalc + Pay submit). The page-mount fetches above can't benefit
    // from warmup — they fire too early — but these typically run 5–60s
    // later, by which point the warmup ping has spun their container up.
    warmup(functions, 'calculateRegistrationCost', 'createRegistration');

    const fetchClass = async () => {
      setState({ status: 'loading' });
      try {
        const getPublicClass = httpsCallable<
          GetPublicClassRequest,
          GetPublicClassResponse
        >(functions, 'getPublicClass');

        const getRequiredAgreements = httpsCallable<
          GetRequiredAgreementsForClassRequest,
          GetRequiredAgreementsForClassResponse
        >(functions, 'getRequiredAgreementsForClass');

        // Fetch class and required agreements in parallel
        const [classResult, agreementsResult] = await Promise.all([
          getPublicClass({ id: classId }),
          getRequiredAgreements({ classId }).catch(() => ({
            data: { agreements: [] as GetRequiredAgreementsForClassResponse['agreements'] },
          })),
        ]);

        const publicClass = classResult.data.class;
        setState({
          status: 'ready',
          publicClass,
          requiredAgreements: agreementsResult.data.agreements,
        });
        trackViewClass(
          typeof window !== 'undefined' ? window : null,
          {
            classId: publicClass.id,
            className: publicClass.name,
            priceCents: publicClass.priceCents,
          }
        );
      } catch (err) {
        console.error('Failed to fetch class:', err);
        setState({
          status: 'error',
          message: 'Unable to load class details. Please try again.',
        });
      }
    };

    fetchClass();
  }, [classId, functions]);

  const handleCalculateCost = useCallback(
    async (
      calcClassId: string,
      quantity: number,
      discountCode?: string
    ): Promise<CalculateRegistrationCostResponse> => {
      const calculateCost = httpsCallable<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >(functions, 'calculateRegistrationCost');

      const result = await calculateCost({
        classId: calcClassId,
        quantity,
        discountCode,
      });
      return result.data;
    },
    [functions]
  );

  const handleSubmit = useCallback(
    async (data: {
      classId: string;
      customerEmail: string;
      customerName: string;
      customerPhone?: string;
      quantity: number;
      discountCode?: string;
      notes?: string;
      paymentNonce: string;
      agreements?: InlineAgreementSigningData[];
    }): Promise<CreateRegistrationResponse> => {
      const createRegistration = httpsCallable<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >(functions, 'createRegistration');

      if (state.status === 'ready') {
        trackAddClassToCart(
          typeof window !== 'undefined' ? window : null,
          {
            classId: state.publicClass.id,
            className: state.publicClass.name,
            priceCents: state.publicClass.priceCents,
            quantity: data.quantity,
          }
        );
      }

      const result = await createRegistration(data);
      return result.data;
    },
    [functions, state]
  );

  const handleSuccess = useCallback(
    (details: {
      confirmationNumber: string;
      customerName: string;
      customerEmail: string;
      pricePaidCents: number;
      quantity: number;
      agreementsSigned?: boolean;
    }) => {
      if (state.status !== 'ready') return;

      const pc = state.publicClass;
      const className = pc.name;

      // Calculate class end time (use first session)
      const firstSessionIso = pc.sessions?.[0]?.dateTime ?? '';
      const startDate = new Date(firstSessionIso);
      const endDate = new Date(
        startDate.getTime() + pc.durationMinutes * 60 * 1000
      );

      trackPurchaseClass(
        typeof window !== 'undefined' ? window : null,
        {
          classId: pc.id,
          className,
          pricePaidCents: details.pricePaidCents,
          quantity: details.quantity,
          confirmationNumber: details.confirmationNumber,
        }
      );

      setState({
        status: 'confirmed',
        confirmationNumber: details.confirmationNumber,
        customerName: details.customerName,
        customerEmail: details.customerEmail,
        className,
        pricePaidCents: details.pricePaidCents,
        quantity: details.quantity,
        classDate: firstSessionIso,
        classEndDate: endDate.toISOString(),
        classDurationMinutes: pc.durationMinutes,
        skillLevel: pc.skillLevel,
        location: pc.location,
        agreementsSigned: details.agreementsSigned,
      });
    },
    [state]
  );

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ width: '100%' }}>
        {state.status === 'loading' && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 8,
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {state.status === 'error' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {state.message}
          </Alert>
        )}

        {state.status === 'ready' && (
          <>
            {/* Registration Form */}
            {state.publicClass.spotsRemaining <= 0 ? (
              <SoldOutPanel
                classId={state.publicClass.id}
                functions={functions}
              />
            ) : !squareAppId ? (
              <Alert severity="warning">
                Registration is not currently available. Please contact us at
                katie@mapleandsprucefolkarts.com to register.
              </Alert>
            ) : (
              <Box>
                <RegistrationCheckoutForm
                  publicClass={state.publicClass}
                  squareApplicationId={squareAppId}
                  squareLocationId={squareLocationId}
                  applePayCheckoutUrl={digitalWalletsEnabled ? applePayCheckoutUrl : undefined}
                  showDigitalWallets={digitalWalletsEnabled}
                  requiredAgreements={state.requiredAgreements}
                  onCalculateCost={handleCalculateCost}
                  onSubmit={handleSubmit}
                  onSuccess={handleSuccess}
                />
              </Box>
            )}
          </>
        )}

        {state.status === 'confirmed' && (
          <Box
            className="registration-confirmation"
            sx={{ p: 4, textAlign: 'center' }}
          >
            {/* Success header */}
            <CheckCircleOutlineIcon
              color="success"
              sx={{ fontSize: 48, mb: 1 }}
            />
            <Typography variant="h5" fontWeight={600} gutterBottom>
              You're Registered!
            </Typography>

            <Divider sx={{ my: 2 }} />

            {/* Class details */}
            <Box sx={{ textAlign: 'left', mb: 2 }}>
              <Typography variant="h6" fontWeight={600}>
                {state.className}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {formatClassDateTime(state.classDate)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDuration(state.classDurationMinutes)} &middot;{' '}
                {formatSkillLevel(state.skillLevel)}
              </Typography>
              <Typography
                variant="body1"
                fontWeight={500}
                sx={{ mt: 1 }}
              >
                ${(state.pricePaidCents / 100).toFixed(2)} paid
              </Typography>
            </Box>

            {/* Waiver signed indicator */}
            {state.agreementsSigned && (
              <Alert
                severity="success"
                icon={<CheckCircleOutlineIcon />}
                sx={{ mb: 2, textAlign: 'left' }}
              >
                Waiver signed — no further action needed.
              </Alert>
            )}

            {/* Confirmation number — de-emphasized */}
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2 }}
            >
              Confirmation:{' '}
              <Typography
                component="span"
                variant="body2"
                fontFamily="monospace"
              >
                {state.confirmationNumber}
              </Typography>
            </Typography>

            <Divider sx={{ my: 2 }} />

            {/* Action buttons */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                gap: 2,
                mb: 3,
              }}
            >
              <Button
                variant="outlined"
                color="primary"
                startIcon={<CalendarTodayIcon />}
                onClick={() => {
                  const icsContent = generateIcsFile({
                    startDate: state.classDate,
                    endDate: state.classEndDate,
                    summary: state.className,
                    location:
                      state.location ?? 'Maple & Spruce Folk Arts',
                    description: `Class at Maple & Spruce Folk Arts. Confirmation: ${state.confirmationNumber}`,
                  });
                  const blob = new Blob([icsContent], {
                    type: 'text/calendar;charset=utf-8',
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'class.ics';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }}
              >
                Add to Calendar
              </Button>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<PrintIcon />}
                onClick={() => window.print()}
              >
                Print
              </Button>
            </Box>

            {/* Email confirmation notice */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              A confirmation email has been sent to{' '}
              <Typography
                component="span"
                variant="body2"
                fontWeight={500}
              >
                {state.customerEmail}
              </Typography>
            </Typography>

            {/* Contact info */}
            <Typography variant="body2" color="text.secondary">
              Questions? Contact us at{' '}
              <Typography
                component="a"
                href="mailto:katie@mapleandsprucefolkarts.com"
                variant="body2"
                color="primary"
                fontWeight={500}
                sx={{ textDecoration: 'none' }}
              >
                katie@mapleandsprucefolkarts.com
              </Typography>
            </Typography>
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
