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
  attach: (selectorOrElement: string | HTMLElement) => Promise<void>;
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
 * Check if an element is inside a Shadow DOM tree.
 */
function isInShadowDom(el: HTMLElement): boolean {
  let node: Node | null = el;
  while (node) {
    if (node instanceof ShadowRoot) return true;
    node = node.parentNode;
  }
  return false;
}

/**
 * Square Card Form component
 *
 * Wraps the Square Web Payments SDK to provide a secure card input field.
 * Loads the Square script, initializes the card element, and exposes
 * a tokenize function to the parent via onTokenizeRef.
 *
 * Handles Shadow DOM: Square SDK cannot attach inside Shadow DOM,
 * so when running inside one (e.g. Webflow Code Components), the card
 * container is created in the regular DOM and positioned to overlay
 * a placeholder element inside the Shadow DOM.
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
  const placeholderRef = useRef<HTMLDivElement>(null);
  const externalContainerRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  // Clean up external container on unmount
  useEffect(() => {
    return () => {
      if (cardRef.current) {
        cardRef.current.destroy().catch(console.error);
      }
      if (externalContainerRef.current) {
        externalContainerRef.current.remove();
        externalContainerRef.current = null;
      }
    };
  }, []);

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
  }, [applicationId, locationId]);

  const initializeCard = useCallback(async () => {
    try {
      if (!window.Square) {
        throw new Error('Square SDK not loaded');
      }

      // Wait for the placeholder ref to be attached to the DOM.
      let placeholder = placeholderRef.current;
      if (!placeholder) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (placeholderRef.current) {
              placeholder = placeholderRef.current;
              resolve();
            } else {
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        });
      }

      // Determine the attach target. Square SDK cannot render inside
      // Shadow DOM, so if we detect we're in one, create an external
      // container in the regular DOM positioned over the placeholder.
      let attachTarget: HTMLElement;

      if (placeholder && isInShadowDom(placeholder)) {
        // Create an external container in the regular DOM
        const external = document.createElement('div');
        external.style.cssText =
          'min-height: 56px; border: 1px solid #e0e0e0; border-radius: 4px; padding: 8px; box-sizing: border-box;';
        externalContainerRef.current = external;

        // Insert the external container right after the Shadow DOM host
        // so it appears visually in the right place
        let host: Element | null = placeholder;
        while (host && !(host instanceof ShadowRoot)) {
          host = host.parentNode as Element;
        }
        const shadowHost = (host as ShadowRoot | null)?.host;
        if (shadowHost?.parentElement) {
          shadowHost.parentElement.insertBefore(
            external,
            shadowHost.nextSibling
          );
        } else {
          document.body.appendChild(external);
        }

        attachTarget = external;
      } else {
        // Normal DOM — attach directly to the placeholder
        attachTarget = placeholder!;
      }

      const payments = await window.Square.payments(
        applicationId,
        locationId
      );
      const card = await payments.card();
      await card.attach(attachTarget);

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
        ref={placeholderRef}
        id="square-card-container"
        sx={{
          minHeight: externalContainerRef.current ? 0 : 56,
          border: isLoading || externalContainerRef.current ? 'none' : 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: isLoading || externalContainerRef.current ? 0 : 1,
        }}
      />
    </Box>
  );
}
