'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';

/**
 * Square Web Payments SDK types (subset needed for card payment)
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
 * Square Card Form component
 *
 * Wraps the Square Web Payments SDK to provide a secure card input field.
 *
 * Shadow DOM handling: Square SDK cannot render inside Shadow DOM,
 * so when detected (e.g. Webflow Code Components), the card container
 * and any afterCardContent are rendered in the regular DOM as a sibling
 * after the Shadow DOM host element.
 */
export function SquareCardForm({
  applicationId,
  locationId,
  onReady,
  onTokenizeRef,
  afterCardContent,
}: SquareCardFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );
  const cardRef = useRef<SquareCard | null>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  // Clean up external elements on unmount
  useEffect(() => {
    return () => {
      if (cardRef.current) {
        cardRef.current.destroy().catch(console.error);
      }
      if (wrapperRef.current) {
        wrapperRef.current.remove();
        wrapperRef.current = null;
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

      let attachTarget: HTMLElement;

      if (placeholder && isInShadowDom(placeholder)) {
        // Shadow DOM mode: create external wrapper with card + portal for afterCardContent
        const shadowHost = findShadowHost(placeholder);

        // Get computed width from the shadow host for matching layout
        const hostWidth = shadowHost
          ? getComputedStyle(shadowHost).width
          : '100%';

        // Create wrapper that holds card + afterCardContent
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `max-width: ${hostWidth}; box-sizing: border-box;`;
        wrapperRef.current = wrapper;

        // Card container
        const cardContainer = document.createElement('div');
        cardContainer.style.cssText =
          'min-height: 56px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 8px; box-sizing: border-box; margin-bottom: 24px;';
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

        attachTarget = cardContainer;
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

      {/* In normal DOM this is the card container; in Shadow DOM it's a hidden placeholder */}
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
