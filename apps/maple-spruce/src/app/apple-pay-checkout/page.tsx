'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/* ---------- Square SDK types (local, no external imports) ---------- */

interface SquareTokenizeResult {
  status: 'OK' | 'ERROR';
  token?: string;
  errors?: Array<{ message: string }>;
}

interface SquareApplePay {
  attach: (selector: string) => Promise<void>;
  addEventListener: (
    event: string,
    cb: (result: SquareTokenizeResult) => void
  ) => void;
}

interface SquarePaymentsInstance {
  paymentRequest: (req: {
    countryCode: string;
    currencyCode: string;
    total: { amount: string; label: string };
  }) => unknown;
  applePay: (paymentRequest: unknown) => Promise<SquareApplePay>;
}

interface SquareSDK {
  payments: (
    applicationId: string,
    locationId: string
  ) => Promise<SquarePaymentsInstance>;
}

/* ---------- Styles ---------- */

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#ffffff',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '24px',
    textAlign: 'center' as const,
  },
  label: {
    fontSize: '18px',
    fontWeight: 500 as const,
    color: '#333333',
    marginBottom: '8px',
  },
  amount: {
    fontSize: '32px',
    fontWeight: 700 as const,
    color: '#111111',
    marginBottom: '24px',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: '400px',
    minHeight: '48px',
    marginBottom: '16px',
  },
  cancel: {
    fontSize: '14px',
    color: '#666666',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    textDecoration: 'underline',
    padding: '8px',
  },
  status: {
    fontSize: '16px',
    color: '#666666',
    marginTop: '16px',
  },
  error: {
    fontSize: '14px',
    color: '#cc0000',
    marginTop: '16px',
    maxWidth: '400px',
  },
  success: {
    fontSize: '18px',
    color: '#28a745',
    fontWeight: 500 as const,
  },
};

/* ---------- Inner component (uses useSearchParams) ---------- */

function ApplePayCheckoutInner(): React.ReactElement {
  const searchParams = useSearchParams();

  const amountCents = Number(searchParams.get('amount') ?? '0');
  const applicationId = searchParams.get('applicationId') ?? '';
  const locationId = searchParams.get('locationId') ?? '';
  const label = searchParams.get('label') ?? 'Class Registration';
  const allowedOrigin = searchParams.get('origin') ?? '';

  const [status, setStatus] = useState<
    'loading' | 'ready' | 'processing' | 'success' | 'error'
  >('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const sdkLoaded = useRef(false);

  const handleClose = useCallback((): void => {
    window.close();
  }, []);

  const handleToken = useCallback(
    (tokenResult: SquareTokenizeResult): void => {
      if (tokenResult.status === 'OK' && tokenResult.token) {
        setStatus('success');
        window.opener?.postMessage(
          { type: 'APPLE_PAY_TOKEN', token: tokenResult.token },
          allowedOrigin
        );
        setTimeout(() => window.close(), 1500);
      } else {
        setStatus('error');
        const messages =
          tokenResult.errors?.map((e) => e.message).join(', ') ??
          'Payment authorization failed.';
        setErrorMessage(messages);
      }
    },
    [allowedOrigin]
  );

  const initializeApplePay = useCallback(async (): Promise<void> => {
    const square = (window as unknown as { Square?: SquareSDK }).Square;
    if (!square) {
      throw new Error('Square SDK failed to load.');
    }

    const payments = await square.payments(applicationId, locationId);
    const paymentRequest = payments.paymentRequest({
      countryCode: 'US',
      currencyCode: 'USD',
      total: { amount: (amountCents / 100).toFixed(2), label },
    });

    const applePay = await payments.applePay(paymentRequest);
    await applePay.attach('#apple-pay-button');
    setStatus('ready');
    applePay.addEventListener('token', handleToken);
  }, [applicationId, locationId, amountCents, label, handleToken]);

  useEffect(() => {
    if (sdkLoaded.current) return;
    sdkLoaded.current = true;

    if (!applicationId || !locationId || !amountCents || !allowedOrigin) {
      setStatus('error');
      setErrorMessage(
        'Missing required parameters: amount, applicationId, locationId, and origin are all required.'
      );
      return;
    }

    const isSandbox = applicationId.startsWith('sandbox-');
    const sdkUrl = isSandbox
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js';

    const script = document.createElement('script');
    script.src = sdkUrl;
    script.async = true;

    script.onload = (): void => {
      initializeApplePay().catch((err: unknown) => {
        setStatus('error');
        const message =
          err instanceof Error ? err.message : 'Failed to initialize Apple Pay';
        if (
          message.includes('not supported') ||
          message.includes('not available') ||
          message.includes('not a function') ||
          message.includes('is undefined')
        ) {
          setErrorMessage(
            'Apple Pay is not available on this device or browser. Please use Safari on an Apple device with Apple Pay configured.'
          );
        } else {
          setErrorMessage(message);
        }
      });
    };

    script.onerror = (): void => {
      setStatus('error');
      setErrorMessage('Failed to load the Square payment SDK.');
    };

    document.head.appendChild(script);
  }, [applicationId, locationId, amountCents, allowedOrigin, initializeApplePay]);

  const displayAmount = (amountCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  return (
    <div style={styles.container}>
      {status === 'loading' && (
        <>
          <p style={styles.label}>{label}</p>
          <p style={styles.amount}>{displayAmount}</p>
          <p style={styles.status}>Initializing Apple Pay...</p>
        </>
      )}

      {status === 'ready' && (
        <>
          <p style={styles.label}>{label}</p>
          <p style={styles.amount}>{displayAmount}</p>
          <div id="apple-pay-button" style={styles.buttonContainer} />
          <button type="button" onClick={handleClose} style={styles.cancel}>
            Cancel
          </button>
        </>
      )}

      {status === 'processing' && (
        <>
          <p style={styles.label}>{label}</p>
          <p style={styles.amount}>{displayAmount}</p>
          <p style={styles.status}>Processing...</p>
        </>
      )}

      {status === 'success' && (
        <>
          <p style={styles.success}>Payment authorized</p>
          <p style={styles.status}>This window will close shortly.</p>
        </>
      )}

      {status === 'error' && (
        <>
          <p style={styles.label}>{label}</p>
          <p style={styles.amount}>{displayAmount}</p>
          <p style={styles.error}>{errorMessage}</p>
          <button type="button" onClick={handleClose} style={styles.cancel}>
            Close
          </button>
        </>
      )}

      {typeof window !== 'undefined' &&
        !window.opener &&
        status !== 'error' &&
        status !== 'loading' && (
          <p style={{ ...styles.status, fontSize: '12px', marginTop: '24px' }}>
            This page should be opened as a popup from the registration form.
          </p>
        )}
    </div>
  );
}

/* ---------- Page component with Suspense boundary ---------- */

export default function ApplePayCheckoutPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <p style={styles.status}>Loading...</p>
        </div>
      }
    >
      <ApplePayCheckoutInner />
    </Suspense>
  );
}
