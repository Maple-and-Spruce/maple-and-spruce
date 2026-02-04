'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';

/**
 * Square Web Payments SDK types (subset needed for card payment)
 *
 * The full SDK loads via script tag; these types are declared locally
 * to avoid a separate package dependency.
 */
interface SquarePayments {
  card: () => Promise<SquareCard>;
}

interface SquareCard {
  attach: (selector: string) => Promise<void>;
  tokenize: () => Promise<SquareTokenizeResult>;
  destroy: () => Promise<void>;
}

interface SquareTokenizeResult {
  status: 'OK' | 'ERROR';
  token?: string;
  errors?: Array<{ message: string }>;
}

declare global {
  interface Window {
    Square?: {
      payments: (
        applicationId: string,
        locationId: string
      ) => Promise<SquarePayments>;
    };
  }
}

interface SquareCardFormProps {
  applicationId: string;
  locationId: string;
  /** Called when the form is ready to tokenize */
  onReady?: () => void;
  /** Ref function to expose tokenize to parent */
  onTokenizeRef: (tokenize: () => Promise<string>) => void;
}

/**
 * Square Card Form component
 *
 * Wraps the Square Web Payments SDK to provide a secure card input field.
 * Loads the Square script, initializes the card element, and exposes
 * a tokenize function to the parent via onTokenizeRef.
 *
 * @see https://developer.squareup.com/docs/web-payments/take-card-payment
 */
export function SquareCardForm({
  applicationId,
  locationId,
  onReady,
  onTokenizeRef,
}: SquareCardFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<SquareCard | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Load the Square SDK script
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const isSandbox =
      applicationId.startsWith('sandbox-') ||
      applicationId.startsWith('sq0idp-');
    const scriptUrl = isSandbox
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js';

    // Check if script is already loaded
    if (window.Square) {
      initializeCard();
      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => initializeCard();
    script.onerror = () => {
      setError('Failed to load payment form. Please refresh and try again.');
      setIsLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      if (cardRef.current) {
        cardRef.current.destroy().catch(console.error);
      }
    };
  }, [applicationId, locationId]);

  const initializeCard = useCallback(async () => {
    try {
      if (!window.Square) {
        throw new Error('Square SDK not loaded');
      }

      const payments = await window.Square.payments(
        applicationId,
        locationId
      );
      const card = await payments.card();
      await card.attach('#square-card-container');

      cardRef.current = card;
      setIsLoading(false);

      // Expose tokenize function to parent
      onTokenizeRef(async () => {
        if (!cardRef.current) {
          throw new Error('Card form not initialized');
        }

        const result = await cardRef.current.tokenize();

        if (result.status !== 'OK' || !result.token) {
          const errorMessage =
            result.errors?.map((e) => e.message).join(', ') ||
            'Payment tokenization failed';
          throw new Error(errorMessage);
        }

        return result.token;
      });

      onReady?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to initialize payment form';
      setError(message);
      setIsLoading(false);
    }
  }, [applicationId, locationId, onReady, onTokenizeRef]);

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Card Details
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {isLoading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            py: 2,
          }}
        >
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Loading payment form...
          </Typography>
        </Box>
      )}

      <Box
        ref={containerRef}
        id="square-card-container"
        sx={{
          minHeight: 56,
          border: isLoading ? 'none' : 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: isLoading ? 0 : 1,
        }}
      />
    </Box>
  );
}
