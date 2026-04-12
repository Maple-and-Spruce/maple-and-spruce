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
  ThemeProvider,
} from '@mui/material';
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
    (details: {
      confirmationNumber: string;
      customerName: string;
      pricePaidCents: number;
      quantity: number;
    }) => {
      if (state.status !== 'ready') return;

      const className = state.publicClass.name;
      const value = details.pricePaidCents / 100;

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
        className,
        pricePaidCents: details.pricePaidCents,
        quantity: details.quantity,
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
                  onCalculateCost={handleCalculateCost}
                  onSubmit={handleSubmit}
                  onSuccess={handleSuccess}
                />
              </Box>
            )}
          </>
        )}

        {state.status === 'confirmed' && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
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

            <Box sx={{ borderTop: 1, borderColor: 'divider', my: 2 }} />

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
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
