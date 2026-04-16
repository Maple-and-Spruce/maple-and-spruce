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
  ThemeProvider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PrintIcon from '@mui/icons-material/Print';
import { httpsCallable } from 'firebase/functions';
import { theme } from '@maple/react/theme';
import { RegistrationCheckoutForm } from '@maple/react/registrations';
import type { PublicClass } from '@maple/ts/domain';
import type {
  GetPublicClassRequest,
  GetPublicClassResponse,
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse,
  CreateRegistrationRequest,
  CreateRegistrationResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';


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

interface RegistrationWidgetProps {
  classId: string;
  squareAppId: string;
  squareLocationId: string;
  env: string;
}

type WidgetState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; publicClass: PublicClass }
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
    };

export function RegistrationWidget({
  classId,
  squareAppId,
  squareLocationId,
  env,
}: RegistrationWidgetProps) {
  const [state, setState] = useState<WidgetState>({ status: 'loading' });

  const functions = useMemo(() => getWidgetFunctions(env), [env]);

  // Fetch class details on mount
  useEffect(() => {
    if (!classId) {
      setState({ status: 'error', message: 'No class ID provided.' });
      return;
    }

    const fetchClass = async () => {
      setState({ status: 'loading' });
      try {
        const getPublicClass = httpsCallable<
          GetPublicClassRequest,
          GetPublicClassResponse
        >(functions, 'getPublicClass');

        const result = await getPublicClass({ id: classId });
        setState({ status: 'ready', publicClass: result.data.class });
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
    }): Promise<CreateRegistrationResponse> => {
      const createRegistration = httpsCallable<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >(functions, 'createRegistration');

      const result = await createRegistration(data);
      return result.data;
    },
    [functions]
  );

  const handleSuccess = useCallback(
    (details: {
      confirmationNumber: string;
      customerName: string;
      customerEmail: string;
      pricePaidCents: number;
      quantity: number;
    }) => {
      if (state.status !== 'ready') return;

      const pc = state.publicClass;
      const className = pc.name;
      const value = details.pricePaidCents / 100;

      // Calculate class end time (use first session)
      const firstSessionIso = pc.sessions?.[0]?.dateTime ?? '';
      const startDate = new Date(firstSessionIso);
      const endDate = new Date(
        startDate.getTime() + pc.durationMinutes * 60 * 1000
      );

      // Meta Pixel: CompleteRegistration event
      const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
      if (win?.fbq) {
        (win.fbq as (...args: unknown[]) => void)(
          'track', 'CompleteRegistration', {
            value,
            currency: 'USD',
            content_name: className,
          }
        );
      }

      // GTM dataLayer: for GA4 and other tags
      if (win) {
        const dataLayer = (win.dataLayer || []) as Record<string, unknown>[];
        dataLayer.push({
          event: 'complete_registration',
          registration_value: value,
          registration_currency: 'USD',
          class_name: className,
          confirmation_number: details.confirmationNumber,
        });
        win.dataLayer = dataLayer;
      }

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
              <Alert severity="info">
                This class is currently full. Please check back later.
              </Alert>
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
                  env={env}
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
