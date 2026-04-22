'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';

/**
 * Square Web Payments SDK types
 */
interface SquarePaymentRequest {
  update: (options: { total: { amount: string; label: string } }) => void;
}

interface SquarePayments {
  card: () => Promise<SquareCard>;
  paymentRequest: (options: {
    countryCode: string;
    currencyCode: string;
    total: { amount: string; label: string };
  }) => unknown;
  applePay: (paymentRequest: unknown) => Promise<SquareDigitalWallet>;
  googlePay: (paymentRequest: unknown) => Promise<SquareDigitalWallet>;
}

interface SquareCard {
  attach: (selectorOrElement: string | HTMLElement) => Promise<void>;
  tokenize: () => Promise<SquareTokenizeResult>;
  destroy: () => Promise<void>;
}

interface SquareDigitalWallet {
  attach: (
    selectorOrElement: string | HTMLElement,
    options?: {
      buttonColor?: string;
      buttonSizeMode?: string;
      buttonType?: string;
    }
  ) => Promise<void>;
  tokenize: () => Promise<SquareTokenizeResult>;
  destroy: () => Promise<void>;
  addEventListener: (
    event: string,
    callback: (tokenResult: SquareTokenizeResult) => void
  ) => void;
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
  /** Square environment — 'prod' loads production SDK, anything else loads sandbox */
  env?: string;
  /** Total amount in cents — used for Apple Pay / Google Pay payment sheet */
  totalCents?: number;
  /** Whether to initialize digital wallet buttons (Apple Pay / Google Pay). Default false. */
  showDigitalWallets?: boolean;
  /** Called when the form is ready to tokenize */
  onReady?: () => void;
  /** Ref function to expose tokenize to parent */
  onTokenizeRef: (tokenize: () => Promise<string>) => void;
  /** Called when a digital wallet (Apple Pay / Google Pay) completes tokenization directly */
  onDigitalWalletToken?: (token: string) => void;
  /**
   * Optional content to render after the card form.
   * When in Shadow DOM, this content is portaled to the external
   * container so it appears visually after the card input.
   * Use this for the submit button.
   */
  afterCardContent?: React.ReactNode;
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
 * Find the Shadow DOM host element for a given node.
 */
function findShadowHost(el: HTMLElement): Element | null {
  let node: Node | null = el;
  while (node) {
    if (node instanceof ShadowRoot) return node.host;
    node = node.parentNode;
  }
  return null;
}

/**
 * Square Payment Form component
 *
 * Wraps the Square Web Payments SDK to provide Apple Pay, Google Pay,
 * and a secure card input field.
 *
 * Digital wallets are initialized opportunistically — if the device/browser
 * supports Apple Pay or Google Pay, their buttons appear above the card form
 * with an "Or pay with card" divider. If neither is available, only the card
 * form renders (same as before).
 *
 * Shadow DOM handling: Square SDK cannot render inside Shadow DOM,
 * so when detected (e.g. Webflow Code Components), all payment containers
 * and any afterCardContent are rendered in the regular DOM as a sibling
 * after the Shadow DOM host element.
 */
export function SquareCardForm({
  applicationId,
  locationId,
  env,
  totalCents,
  showDigitalWallets = false,
  onReady,
  onTokenizeRef,
  onDigitalWalletToken,
  afterCardContent,
}: SquareCardFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );
  const [hasApplePay, setHasApplePay] = useState(false);
  const [hasGooglePay, setHasGooglePay] = useState(false);
  const cardRef = useRef<SquareCard | null>(null);
  const applePayRef = useRef<SquareDigitalWallet | null>(null);
  const googlePayRef = useRef<SquareDigitalWallet | null>(null);
  const paymentRequestRef = useRef<SquarePaymentRequest | null>(null);
  const onDigitalWalletTokenRef = useRef(onDigitalWalletToken);
  onDigitalWalletTokenRef.current = onDigitalWalletToken;
  const placeholderRef = useRef<HTMLDivElement>(null);
  const applePayContainerRef = useRef<HTMLDivElement>(null);
  const googlePayContainerRef = useRef<HTMLDivElement>(null);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const sdkLoadedRef = useRef(false);
  const [sdkReady, setSdkReady] = useState(false);

  // Keep the payment request amount in sync with the total
  useEffect(() => {
    if (paymentRequestRef.current && totalCents != null) {
      paymentRequestRef.current.update({
        total: {
          amount: (totalCents / 100).toFixed(2),
          label: 'Total',
        },
      });
    }
  }, [totalCents]);

  // Clean up external elements on unmount
  useEffect(() => {
    return () => {
      if (cardRef.current) {
        cardRef.current.destroy().catch(console.error);
      }
      if (applePayRef.current) {
        applePayRef.current.destroy().catch(console.error);
      }
      if (googlePayRef.current) {
        googlePayRef.current.destroy().catch(console.error);
      }
      if (wrapperRef.current) {
        wrapperRef.current.remove();
        wrapperRef.current = null;
      }
    };
  }, []);

  // Load the Square SDK script
  useEffect(() => {
    if (sdkLoadedRef.current) return;
    sdkLoadedRef.current = true;

    if (window.Square) {
      setSdkReady(true);
      return;
    }

    const isSandbox = env
      ? env !== 'prod'
      : applicationId.startsWith('sandbox-');
    const scriptUrl = isSandbox
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js';

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => {
      setError('Failed to load payment form. Please refresh and try again.');
      setIsLoading(false);
    };
    document.head.appendChild(script);
  }, [applicationId, locationId, env]);

  const initializePayments = useCallback(async () => {
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

      // Resolve attach targets — either React refs (normal DOM) or
      // dynamically created elements (Shadow DOM).
      let cardTarget: HTMLElement;
      let applePayTarget: HTMLElement;
      let googlePayTarget: HTMLElement;

      if (placeholder && isInShadowDom(placeholder)) {
        // Shadow DOM mode: create external wrapper with separate containers.
        const shadowHost = findShadowHost(placeholder);

        const wrapper = document.createElement('div');
        wrapper.style.cssText = ['width: 100%', 'box-sizing: border-box'].join(
          '; '
        );
        wrapperRef.current = wrapper;

        // Apple Pay container
        applePayTarget = document.createElement('div');
        wrapper.appendChild(applePayTarget);

        // Google Pay container
        googlePayTarget = document.createElement('div');
        wrapper.appendChild(googlePayTarget);

        // Card container — styled to match MUI outlined input look
        const cardContainer = document.createElement('div');
        cardContainer.style.cssText = [
          'min-height: 56px',
          'border: 1px solid rgba(0, 0, 0, 0.23)',
          'border-radius: 8px',
          'padding: 12px',
          'box-sizing: border-box',
          'margin-bottom: 24px',
          'transition: border-color 0.2s',
        ].join('; ');
        cardContainer.addEventListener('mouseenter', () => {
          cardContainer.style.borderColor = 'rgba(0, 0, 0, 0.87)';
        });
        cardContainer.addEventListener('mouseleave', () => {
          cardContainer.style.borderColor = 'rgba(0, 0, 0, 0.23)';
        });
        cardContainerRef.current = cardContainer;
        wrapper.appendChild(cardContainer);

        // Portal target for afterCardContent (submit button, etc.)
        const portalTarget = document.createElement('div');
        wrapper.appendChild(portalTarget);
        setPortalContainer(portalTarget);

        // Insert after shadow host
        if (shadowHost?.parentElement) {
          shadowHost.parentElement.insertBefore(
            wrapper,
            shadowHost.nextSibling
          );
        } else {
          document.body.appendChild(wrapper);
        }

        cardTarget = cardContainer;
      } else {
        // Normal DOM — use the React-rendered containers
        cardTarget = placeholder!;
        applePayTarget = applePayContainerRef.current!;
        googlePayTarget = googlePayContainerRef.current!;
      }

      const payments = await window.Square.payments(
        applicationId,
        locationId
      );

      // Digital wallets — only initialize when enabled
      if (showDigitalWallets) {
        const amount =
          totalCents != null ? (totalCents / 100).toFixed(2) : '0.00';
        const paymentRequest = payments.paymentRequest({
          countryCode: 'US',
          currencyCode: 'USD',
          total: { amount, label: 'Total' },
        }) as SquarePaymentRequest;
        paymentRequestRef.current = paymentRequest;

        const handleWalletToken = (result: SquareTokenizeResult): void => {
          if (result.status === 'OK' && result.token) {
            onDigitalWalletTokenRef.current?.(result.token);
          }
        };

        // Initialize Apple Pay (fails gracefully if not supported)
        try {
          const applePay = await payments.applePay(paymentRequest);
          await applePay.attach(applePayTarget);
          applePay.addEventListener('token', handleWalletToken);
          applePayRef.current = applePay;
          setHasApplePay(true);
        } catch {
          // Apple Pay not available — browser/device doesn't support it
        }

        // Initialize Google Pay (fails gracefully if not supported)
        try {
          const googlePay = await payments.googlePay(paymentRequest);
          await googlePay.attach(googlePayTarget);
          googlePay.addEventListener('token', handleWalletToken);
          googlePayRef.current = googlePay;
          setHasGooglePay(true);
        } catch {
          // Google Pay not available — browser/device doesn't support it
        }
      }

      // Initialize card form
      const card = await payments.card();
      await card.attach(cardTarget);

      cardRef.current = card;
      setIsLoading(false);

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
        err instanceof Error
          ? err.message
          : 'Failed to initialize payment form';
      setError(message);
      setIsLoading(false);
    }
  }, [applicationId, locationId, totalCents, showDigitalWallets, onReady, onTokenizeRef]);

  // Initialize payments once SDK is ready AND we have a valid amount
  useEffect(() => {
    if (!sdkReady || initializedRef.current || !totalCents) return;
    initializedRef.current = true;
    initializePayments();
  }, [sdkReady, totalCents, initializePayments]);

  const showDivider = (hasApplePay || hasGooglePay) && !isLoading;

  return (
    <Box>
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

      {/* Digital wallet button containers — Square SDK renders its branded buttons here */}
      <Box
        ref={applePayContainerRef}
        sx={{
          display: portalContainer ? 'none' : 'block',
          mb: hasApplePay ? 1 : 0,
        }}
      />
      <Box
        ref={googlePayContainerRef}
        sx={{
          display: portalContainer ? 'none' : 'block',
          mb: hasGooglePay ? 1 : 0,
        }}
      />

      {/* "Or pay with card" divider between wallet buttons and card input */}
      {showDivider && !portalContainer && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            my: 2,
          }}
        >
          <Box sx={{ flex: 1, borderBottom: 1, borderColor: 'divider' }} />
          <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
            Or pay with card
          </Typography>
          <Box sx={{ flex: 1, borderBottom: 1, borderColor: 'divider' }} />
        </Box>
      )}

      {/* Card form container */}
      <Box
        ref={placeholderRef}
        id="square-card-container"
        sx={{
          minHeight: portalContainer ? 0 : 56,
          border: isLoading || portalContainer ? 'none' : 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: isLoading || portalContainer ? 0 : 1,
        }}
      />

      {/* In normal DOM, afterCardContent renders here inline */}
      {!portalContainer && afterCardContent}

      {/* In Shadow DOM, afterCardContent is portaled to the external container */}
      {portalContainer && afterCardContent
        ? createPortal(afterCardContent, portalContainer)
        : null}
    </Box>
  );
}
