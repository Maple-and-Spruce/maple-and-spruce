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
  Paper,
  Chip,
  Divider,
  ThemeProvider,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
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
      className: string;
      pricePaidCents: number;
      quantity: number;
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
    (confirmationNumber: string) => {
      if (state.status !== 'ready') return;
      setState({
        status: 'confirmed',
        confirmationNumber,
        customerName: '', // Will be populated from the form data
        className: state.publicClass.name,
        pricePaidCents: state.publicClass.priceCents,
        quantity: 1,
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
            {/* Class Details */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" gutterBottom>
                {state.publicClass.name}
              </Typography>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                {state.publicClass.dateTime && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <EventIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(
                        typeof state.publicClass.dateTime === 'string'
                          ? state.publicClass.dateTime
                          : (state.publicClass.dateTime as Date).toISOString()
                      )}{' '}
                      at{' '}
                      {formatTime(
                        typeof state.publicClass.dateTime === 'string'
                          ? state.publicClass.dateTime
                          : (state.publicClass.dateTime as Date).toISOString()
                      )}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccessTimeIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {state.publicClass.durationMinutes} min
                  </Typography>
                </Box>

                {state.publicClass.instructorName && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PersonIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      {state.publicClass.instructorName}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  {formatPrice(state.publicClass.priceCents)}
                </Typography>
                {state.publicClass.spotsRemaining !== undefined && (
                  <Chip
                    size="small"
                    label={`${state.publicClass.spotsRemaining} spots left`}
                    color={
                      state.publicClass.spotsRemaining <= 3
                        ? 'warning'
                        : 'default'
                    }
                  />
                )}
              </Box>

              {state.publicClass.description && (
                <Typography variant="body2" color="text.secondary">
                  {state.publicClass.description}
                </Typography>
              )}
            </Paper>

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
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Register
                </Typography>
                <Divider sx={{ mb: 3 }} />
                <RegistrationCheckoutForm
                  publicClass={state.publicClass}
                  squareApplicationId={squareAppId}
                  squareLocationId={squareLocationId}
                  onCalculateCost={handleCalculateCost}
                  onSubmit={handleSubmit}
                  onSuccess={handleSuccess}
                />
              </Paper>
            )}
          </>
        )}

        {state.status === 'confirmed' && (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <CheckCircleOutlineIcon
              color="success"
              sx={{ fontSize: 64, mb: 2 }}
            />
            <Typography variant="h4" gutterBottom>
              You're Registered!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              Your spot for {state.className} is reserved.
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Box
              sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 3 }}
            >
              <Typography variant="body2" color="text.secondary">
                Confirmation Number
              </Typography>
              <Typography
                variant="body1"
                fontFamily="monospace"
                fontWeight={600}
              >
                {state.confirmationNumber}
              </Typography>
            </Box>

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
          </Paper>
        )}
      </Box>
    </ThemeProvider>
  );
}
