'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Container,
  CircularProgress,
  Alert,
  Paper,
  Chip,
  Button,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import PlaceIcon from '@mui/icons-material/Place';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
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

export default function RegisterClassPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;

  const [publicClass, setPublicClass] = useState<PublicClass | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) return;

    const fetchClass = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const functions = getMapleFunctions();
        const getPublicClass = httpsCallable<
          GetPublicClassRequest,
          GetPublicClassResponse
        >(functions, 'getPublicClass');

        const result = await getPublicClass({ id: classId });
        setPublicClass(result.data.class);
      } catch (err) {
        console.error('Failed to fetch class:', err);
        setError('Unable to load class details. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchClass();
  }, [classId]);

  const handleCalculateCost = useCallback(
    async (
      calcClassId: string,
      quantity: number,
      discountCode?: string
    ): Promise<CalculateRegistrationCostResponse> => {
      const functions = getMapleFunctions();
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
    []
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
      const functions = getMapleFunctions();
      const createRegistration = httpsCallable<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >(functions, 'createRegistration');

      const result = await createRegistration(data);
      return result.data;
    },
    []
  );

  const handleSuccess = useCallback(
    (confirmationNumber: string) => {
      router.push(
        `/register/${classId}/confirm?confirmation=${encodeURIComponent(confirmationNumber)}`
      );
    },
    [router, classId]
  );

  const squareApplicationId =
    process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? '';
  const squareLocationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? '';

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Error state
  if (error || !publicClass) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          py: 4,
        }}
      >
        <Container maxWidth="md">
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || 'Class not found'}
          </Alert>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => router.push('/register')}
          >
            Back to Classes
          </Button>
        </Container>
      </Box>
    );
  }

  const isFull = publicClass.spotsRemaining <= 0;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: 4,
      }}
    >
      <Container maxWidth="md">
        {/* Back Link */}
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/register')}
          sx={{ mb: 2 }}
        >
          Back to Classes
        </Button>

        {/* Class Details */}
        <Paper sx={{ p: 3, mb: 3 }}>
          {publicClass.imageUrl && (
            <Box
              component="img"
              src={publicClass.imageUrl}
              alt={publicClass.name}
              sx={{
                width: '100%',
                maxHeight: 300,
                objectFit: 'cover',
                borderRadius: 1,
                mb: 2,
              }}
            />
          )}

          <Typography variant="h4" component="h1" gutterBottom>
            {publicClass.name}
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            {publicClass.skillLevel && (
              <Chip
                label={publicClass.skillLevel}
                size="small"
                variant="outlined"
              />
            )}
            {publicClass.categoryName && (
              <Chip label={publicClass.categoryName} size="small" />
            )}
            <Chip
              label={formatPrice(publicClass.priceCents)}
              size="small"
              color="primary"
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EventIcon fontSize="small" color="action" />
              <Typography variant="body1">
                {formatDate(publicClass.dateTime)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTimeIcon fontSize="small" color="action" />
              <Typography variant="body1">
                {formatTime(publicClass.dateTime)} ({publicClass.durationMinutes}{' '}
                minutes)
              </Typography>
            </Box>
            {publicClass.instructorName && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon fontSize="small" color="action" />
                <Typography variant="body1">
                  {publicClass.instructorName}
                </Typography>
              </Box>
            )}
            {publicClass.location && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PlaceIcon fontSize="small" color="action" />
                <Typography variant="body1">{publicClass.location}</Typography>
              </Box>
            )}
          </Box>

          <Typography variant="body1" sx={{ mb: 2 }}>
            {publicClass.description}
          </Typography>

          {publicClass.materialsIncluded && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Materials Included
              </Typography>
              <Typography variant="body2">
                {publicClass.materialsIncluded}
              </Typography>
            </Box>
          )}

          {publicClass.whatToBring && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                What to Bring
              </Typography>
              <Typography variant="body2">
                {publicClass.whatToBring}
              </Typography>
            </Box>
          )}

          {publicClass.minimumAge && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Minimum age: {publicClass.minimumAge}+
            </Typography>
          )}
        </Paper>

        {/* Registration Form or Full Message */}
        {isFull ? (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" color="error" gutterBottom>
              This class is full
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Check back later or browse other available classes.
            </Typography>
            <Button
              variant="outlined"
              onClick={() => router.push('/register')}
              sx={{ mt: 2 }}
            >
              Browse Classes
            </Button>
          </Paper>
        ) : (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Register
            </Typography>
            <Chip
              label={`${publicClass.spotsRemaining} spot${publicClass.spotsRemaining === 1 ? '' : 's'} remaining`}
              size="small"
              color={publicClass.spotsRemaining > 5 ? 'success' : 'warning'}
              sx={{ mb: 2 }}
            />
            <Divider sx={{ mb: 3 }} />

            {!squareApplicationId ? (
              <Alert severity="warning">
                Payment processing is not configured. Please contact us to
                register.
              </Alert>
            ) : (
              <RegistrationCheckoutForm
                publicClass={publicClass}
                squareApplicationId={squareApplicationId}
                squareLocationId={squareLocationId}
                onCalculateCost={handleCalculateCost}
                onSubmit={handleSubmit}
                onSuccess={handleSuccess}
              />
            )}
          </Paper>
        )}
      </Container>
    </Box>
  );
}
