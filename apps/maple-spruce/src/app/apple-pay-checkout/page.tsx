'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import logo from './maple-spruce-logo.png';

/* ---------- Square SDK types (local, no external imports) ---------- */

interface SquareTokenizeResult {
  status: string;
  token?: string;
  errors?: Array<{ message: string }>;
}

/**
 * Square's ApplePay has no `attach()` and emits no token event: the page draws
 * its own button and calls `tokenize()` from the click handler. Apple requires
 * that call to happen inside the click, with no await before it.
 */
interface SquareApplePay {
  tokenize: () => Promise<SquareTokenizeResult>;
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

// Brand palette and type, matching mapleandsprucefolkarts.com. This page is
// the one buyers see outside the main site, so it has to look like it.
const BRAND = {
  cream: '#F6F5EF',
  border: '#D5D6C8',
  brown: '#4A3728',
  sage: '#6B7B5E',
  gray: '#7A7A6E',
  error: '#A23B2A',
  serif: 'Georgia, Times, "Times New Roman", serif',
};

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: BRAND.cream,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '32px 16px',
    boxSizing: 'border-box' as const,
    fontFamily: BRAND.serif,
    color: BRAND.brown,
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: '#ffffff',
    border: `1px solid ${BRAND.border}`,
    borderRadius: '12px',
    padding: '28px 24px',
    boxSizing: 'border-box' as const,
    textAlign: 'center' as const,
  },
  logo: {
    width: '96px',
    height: 'auto',
    display: 'block',
    margin: '0 auto 8px',
  },
  business: {
    fontSize: '20px',
    margin: '0 0 4px',
  },
  secureLine: {
    fontSize: '13px',
    color: BRAND.gray,
    margin: '0 0 24px',
  },
  summary: {
    borderTop: `1px solid ${BRAND.border}`,
    borderBottom: `1px solid ${BRAND.border}`,
    padding: '16px 0',
    margin: '0 0 24px',
  },
  label: {
    fontSize: '16px',
    margin: '0 0 8px',
    lineHeight: 1.4,
  },
  amount: {
    fontSize: '32px',
    fontWeight: 700 as const,
    margin: 0,
  },
  cancel: {
    fontFamily: BRAND.serif,
    fontSize: '14px',
    color: BRAND.gray,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    textDecoration: 'underline',
    padding: '8px',
  },
  status: {
    fontSize: '16px',
    color: BRAND.gray,
    margin: '8px 0',
  },
  error: {
    fontSize: '14px',
    color: BRAND.error,
    margin: '8px 0',
  },
  success: {
    fontSize: '18px',
    color: BRAND.sage,
    fontWeight: 700 as const,
    margin: '8px 0',
  },
  footer: {
    marginTop: '20px',
    fontSize: '13px',
    lineHeight: 1.6,
    color: BRAND.gray,
    textAlign: 'center' as const,
  },
  footerLink: {
    color: BRAND.gray,
  },
};


// Apple's own button, drawn by WebKit. React's inline styles cannot set the
// `-apple-pay-button-*` properties, so it is a class. Only Safari renders it,
// which is also the only browser that can reach the `ready` state.
const APPLE_PAY_BUTTON_CSS = `
.apple-pay-button {
  -webkit-appearance: -apple-pay-button;
  -apple-pay-button-type: pay;
  -apple-pay-button-style: black;
  display: block;
  width: 100%;
  height: 48px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
}
`;

const PAYMENT_NOT_AUTHORIZED =
  'Apple Pay didn’t complete, and you haven’t been charged. Close this window to try again or pay with a card.';

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
  const applePayRef = useRef<SquareApplePay | null>(null);

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
      } else if (tokenResult.status === 'Cancel') {
        // The buyer closed the Apple Pay sheet; let them try again.
        setStatus('ready');
      } else {
        setStatus('error');
        console.error('[apple-pay-checkout] Apple Pay did not authorize', tokenResult);
        setErrorMessage(PAYMENT_NOT_AUTHORIZED);
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

    applePayRef.current = await payments.applePay(paymentRequest);
    setStatus('ready');
  }, [applicationId, locationId, amountCents, label]);

  const handleApplePayClick = useCallback((): void => {
    const applePay = applePayRef.current;
    if (!applePay) return;
    setStatus('processing');
    applePay
      .tokenize()
      .then(handleToken)
      .catch((err: unknown) => {
        setStatus('error');
        console.error('[apple-pay-checkout] Apple Pay tokenize failed', err);
        setErrorMessage(PAYMENT_NOT_AUTHORIZED);
      });
  }, [handleToken]);

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
        // Square's own messages name SDK internals and link its docs. Buyers
        // get a plain sentence; the detail stays in the console for us.
        console.error('[apple-pay-checkout] Apple Pay unavailable', err);
        setErrorMessage(
          'Apple Pay isn’t available on this device. Close this window to pay with a card instead.'
        );
      });
    };

    script.onerror = (): void => {
      setStatus('error');
      setErrorMessage(
        'We couldn’t load secure checkout. Check your connection, or close this window to pay with a card.'
      );
    };

    document.head.appendChild(script);
  }, [applicationId, locationId, amountCents, allowedOrigin, initializeApplePay]);

  const displayAmount = (amountCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  return (
    <main style={styles.page}>
      <style>{APPLE_PAY_BUTTON_CSS}</style>
      <div style={styles.card}>
        <img src={logo.src} alt="" style={styles.logo} />
        <h1 style={styles.business}>Maple &amp; Spruce Folk Arts Collective</h1>
        <p style={styles.secureLine}>Secure checkout · Payment processed by Square</p>

        <div style={styles.summary}>
          <p style={styles.label}>{label}</p>
          <p style={styles.amount}>{displayAmount}</p>
        </div>

        {status === 'loading' && (
          <p style={styles.status}>Getting Apple Pay ready…</p>
        )}

        {status === 'ready' && (
          <>
            <button
              type="button"
              aria-label="Pay with Apple Pay"
              onClick={handleApplePayClick}
              className="apple-pay-button"
            />
            <button type="button" onClick={handleClose} style={styles.cancel}>
              Cancel and go back
            </button>
          </>
        )}

        {status === 'processing' && (
          <p style={styles.status}>Waiting for Apple Pay…</p>
        )}

        {status === 'success' && (
          <>
            <p style={styles.success}>Payment authorized</p>
            <p style={styles.status}>
              Taking you back to finish your registration. If this tab stays
              open, you can close it.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <p style={styles.error}>{errorMessage}</p>
            <button type="button" onClick={handleClose} style={styles.cancel}>
              Close and go back
            </button>
          </>
        )}
      </div>

      <footer style={styles.footer}>
        688 Beulah Rd, Morgantown, WV 26508
        <br />
        <a style={styles.footerLink} href="mailto:katie@mapleandsprucefolkarts.com">
          katie@mapleandsprucefolkarts.com
        </a>
        {' · '}
        <a style={styles.footerLink} href="tel:+13043144506">
          304-314-4506
        </a>
      </footer>
    </main>
  );
}

/* ---------- Page component — SSR disabled ---------- */

const ApplePayCheckoutClient = dynamic(
  () => Promise.resolve({ default: ApplePayCheckoutInner }),
  {
    ssr: false,
    loading: () => (
      <main style={styles.page}>
        <p style={styles.status}>Loading secure checkout…</p>
      </main>
    ),
  }
);

export default function ApplePayCheckoutPage(): React.ReactElement {
  return <ApplePayCheckoutClient />;
}
