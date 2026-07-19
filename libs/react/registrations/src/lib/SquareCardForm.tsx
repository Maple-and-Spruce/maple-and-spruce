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

interface SquareVerifyBuyerDetails {
  /** 'STORE' when vaulting a card on file; 'CHARGE' for a one-time payment. */
  intent: 'STORE' | 'CHARGE';
  /** Recommended by Square for SCA risk scoring / mandate on STORE. */
  billingContact?: SquareBillingContact;
  /** Required for CHARGE intent only. */
  amount?: string;
  /** Required for CHARGE intent only. */
  currencyCode?: string;
}

interface SquareVerifyBuyerResult {
  token: string;
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
  /**
   * Strong Customer Authentication step. For `intent: 'STORE'` this produces
   * the verification token real Square requires to vault a card on file via the
   * Cards API — without it, `cards.create` is rejected.
   */
  verifyBuyer: (
    source: string,
    details: SquareVerifyBuyerDetails
  ) => Promise<SquareVerifyBuyerResult>;
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

/**
 * Shape of an error thrown by the Square Web Payments SDK (`PaymentsError`).
 * `type` is the machine-readable discriminator — notably
 * `'InitializationTimeoutError'` ("Web Payments SDK was unable to be
 * initialized in time"), which is the failure Safari's cross-site tracking
 * prevention (ITP) provokes when it blocks Square's bootstrap iframe.
 */
interface SquarePaymentsError {
  name?: string;
  message?: string;
  type?: string;
}

/** Billing contact passed to `verifyBuyer` for STORE-intent SCA. */
export interface SquareBillingContact {
  givenName?: string;
  familyName?: string;
  email?: string;
}

/**
 * Result of the card entry step. `nonce` is the single-use payment token from
 * `card.tokenize()`. `verificationToken` is present only when the form was told
 * to verify the buyer for STORE intent (`verifyBuyerForStore`) — it is the token
 * real Square requires to vault the nonce as a card on file.
 */
export interface CardTokenizeResult {
  nonce: string;
  verificationToken?: string;
}

declare global {
  interface Window {
    Square?: {
      payments: (
        applicationId: string,
        locationId: string
      ) => Promise<SquarePayments>;
    };
    /** GA4, present on the Webflow public pages. Used to beacon init failures. */
    gtag?: (...args: unknown[]) => void;
    /** WebKit-only; its presence signals Safari/iOS — the ITP-affected browsers. */
    ApplePaySession?: unknown;
  }
}

/**
 * Structured detail about a payment-form initialization failure. Emitted to the
 * console, beaconed to GA, and passed to any `onInitError` consumer so we can
 * measure real-world incidence (previously the error was swallowed into an
 * Alert with no telemetry).
 */
export interface SquareInitErrorInfo {
  /** Square error `type` when present (e.g. `'InitializationTimeoutError'`). */
  errorType?: string;
  errorName?: string;
  message: string;
  /** True when the failure is Square's init/bootstrap timeout (the Safari/ITP class). */
  isInitTimeout: boolean;
  applicationId: string;
  locationId: string;
  env?: string;
  /** Present ⇒ WebKit/Safari, the browser family affected by ITP cross-site blocking. */
  hasApplePaySession: boolean;
  userAgent: string;
}

/**
 * Report a payment-form init failure to the console and (when available) GA.
 * Telemetry must never throw back into the payment flow, so the beacon is
 * fully guarded.
 */
function reportPaymentInitFailure(info: SquareInitErrorInfo): void {
  // Surface for anyone watching the console — this used to be swallowed.
  console.error('[SquareCardForm] payment form failed to initialize', info);
  try {
    window.gtag?.('event', 'payment_init_failed', {
      error_type: info.errorType ?? info.errorName ?? 'unknown',
      is_init_timeout: info.isInitTimeout,
      square_env:
        info.env ??
        (info.applicationId.startsWith('sandbox-') ? 'sandbox' : 'prod'),
      is_safari: info.hasApplePaySession,
    });
  } catch {
    // Never let a telemetry failure break the form.
  }
}

/** Inject a `<script>`; resolve on load, reject on error. */
function loadSquareScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('script load error'));
    document.head.appendChild(script);
  });
}

/**
 * Beacon that `square.js` loaded but didn't define `window.Square` — the
 * corrupt/empty-cached-script case (observed on Safari: an interrupted fetch
 * cached under the valid ETag, then re-served via 304). Emitted when we fall
 * back to a cache-busted reload, so we can measure how often customers hit it.
 */
function reportSdkCacheBustRetry(isSandbox: boolean): void {
  console.warn(
    '[SquareCardForm] square.js loaded without defining window.Square — retrying with a cache-busted URL'
  );
  try {
    window.gtag?.('event', 'payment_sdk_cache_bust_retry', {
      square_env: isSandbox ? 'sandbox' : 'prod',
    });
  } catch {
    // Never let a telemetry failure break the form.
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
  /**
   * Called when the Square SDK fails to initialize the card form (e.g. Safari
   * ITP blocking the bootstrap iframe → `InitializationTimeoutError`). Receives
   * structured detail for telemetry / custom fallback UI. The component already
   * console.errors + GA-beacons on its own; this is an extra hook for consumers.
   */
  onInitError?: (info: SquareInitErrorInfo) => void;
  /** Ref function to expose tokenize to parent */
  onTokenizeRef: (tokenize: () => Promise<CardTokenizeResult>) => void;
  /**
   * When true, the card entry step also runs `verifyBuyer({ intent: 'STORE' })`
   * and returns its `verificationToken` alongside the nonce. Set this for any
   * card-on-file / vaulting flow (installments, subscriptions, saved-card
   * updates) — real Square rejects `cards.create` without it. Leave unset for
   * one-time charges.
   */
  verifyBuyerForStore?: boolean;
  /** Billing contact used for STORE-intent SCA verification (recommended). */
  billingContact?: SquareBillingContact;
  /** Called when a digital wallet (Apple Pay / Google Pay) completes tokenization directly */
  onDigitalWalletToken?: (token: string) => void;
  /**
   * Optional content to render after the card form.
   * When in Shadow DOM, this content is portaled to the external
   * container so it appears visually after the card input.
   * Use this for the submit button.
   */
  afterCardContent?: React.ReactNode;
  /**
   * Optional max width (px) for the external Shadow-DOM wrapper. In Shadow DOM
   * the card form is inserted as a sibling of the shadow host with width:100%,
   * which escapes any maxWidth set inside the shadow root. Pass the host
   * widget's maxWidth so the card + portaled button stay aligned with it.
   */
  maxWidth?: number;
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
  onInitError,
  onTokenizeRef,
  verifyBuyerForStore = false,
  billingContact,
  onDigitalWalletToken,
  afterCardContent,
  maxWidth,
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
  const onInitErrorRef = useRef(onInitError);
  onInitErrorRef.current = onInitError;
  // Kept in refs so changing them doesn't re-init the SDK, and so the tokenize
  // closure always reads the latest values (billing contact fills in as the
  // family types).
  const verifyBuyerForStoreRef = useRef(verifyBuyerForStore);
  verifyBuyerForStoreRef.current = verifyBuyerForStore;
  const billingContactRef = useRef(billingContact);
  billingContactRef.current = billingContact;
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

  // Load the Square SDK script.
  //
  // A corrupt/empty `square.js` can get stuck in the browser cache (observed on
  // Safari: an interrupted fetch stored under the valid ETag, then re-served
  // indefinitely via 304 revalidation). The `<script>` fires `onload` but
  // defines no `window.Square`, so init later throws "Square SDK not loaded".
  // To self-heal — for us and for any customer stuck in that cache state — if
  // the first load doesn't yield `window.Square`, we retry once with a
  // cache-busting query param. That's a fresh cache key, so the browser is
  // forced to the network for a clean copy, routing around the poisoned entry
  // without anyone having to manually clear their cache.
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

    (async () => {
      // First attempt: the plain URL, so normal CDN/browser caching applies
      // (unaffected browsers pay zero overhead — this is the only load).
      try {
        await loadSquareScript(scriptUrl);
      } catch {
        // network / onerror — fall through to the cache-busted retry
      }
      if (window.Square) {
        setSdkReady(true);
        return;
      }

      // The script "loaded" but defined nothing (empty/corrupt cached body) or
      // errored. Retry under a cache-busting key — forced to the network — which
      // recovers the poisoned-cache case.
      reportSdkCacheBustRetry(isSandbox);
      try {
        await loadSquareScript(`${scriptUrl}?_cb=${Date.now()}`);
      } catch {
        // handled by the window.Square check below
      }
      if (window.Square) {
        setSdkReady(true);
        return;
      }

      setError('Failed to load payment form. Please refresh and try again.');
      setIsLoading(false);
    })();
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
        wrapper.style.cssText = [
          'width: 100%',
          'box-sizing: border-box',
          // Match the host widget's maxWidth so the externally-inserted card
          // form + portaled button don't stretch full-width past it.
          ...(maxWidth
            ? [
                `max-width: ${maxWidth}px`,
                'margin-left: auto',
                'margin-right: auto',
              ]
            : []),
        ].join('; ');
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

        const nonce = result.token;

        // Card-on-file flows must additionally verify the buyer for STORE
        // intent — real Square requires the resulting token to vault the card
        // via the Cards API (SCA / mandate). One-time charges skip this.
        let verificationToken: string | undefined;
        if (verifyBuyerForStoreRef.current) {
          const verification = await payments.verifyBuyer(nonce, {
            intent: 'STORE',
            billingContact: billingContactRef.current ?? {},
          });
          verificationToken = verification?.token;
          if (!verificationToken) {
            throw new Error(
              'Card verification failed. Please try a different card.'
            );
          }
        }

        return { nonce, verificationToken };
      });

      onReady?.();
    } catch (err) {
      const sqErr = err as SquarePaymentsError;
      const message =
        err instanceof Error
          ? err.message
          : sqErr?.message ?? 'Failed to initialize payment form';
      // Square's bootstrap-timeout — the Safari/ITP class — reports itself with
      // `type: 'InitializationTimeoutError'`; fall back to a message match for
      // safety if the type is ever absent.
      const isInitTimeout =
        sqErr?.type === 'InitializationTimeoutError' ||
        /unable to be initialized/i.test(message);

      const info: SquareInitErrorInfo = {
        errorType: sqErr?.type,
        errorName: err instanceof Error ? err.name : sqErr?.name,
        message,
        isInitTimeout,
        applicationId,
        locationId,
        env,
        hasApplePaySession:
          typeof window !== 'undefined' &&
          typeof window.ApplePaySession !== 'undefined',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      };
      reportPaymentInitFailure(info);
      onInitErrorRef.current?.(info);

      setError(
        isInitTimeout
          ? "We couldn't load the secure payment form. Please refresh the page and try again — if it keeps happening, open this page in a private browsing window or a different browser."
          : message
      );
      setIsLoading(false);
    }
  }, [applicationId, locationId, env, totalCents, showDigitalWallets, onReady, onTokenizeRef, maxWidth]);

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
