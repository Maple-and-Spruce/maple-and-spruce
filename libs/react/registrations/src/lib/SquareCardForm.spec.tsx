// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  SquareCardForm,
  type CardTokenizeResult,
  type SquareInitErrorInfo,
} from './SquareCardForm';

/**
 * Guards the Square SDK environment-selection contract that the Webflow
 * widgets rely on: when no `env` is passed, the sandbox-vs-production CDN is
 * chosen from the Square App ID prefix. This is what lets a widget read prod
 * section data while taking payment through a sandbox Square app.
 */
function injectedSquareScriptSrcs(): string[] {
  return Array.from(document.head.querySelectorAll('script'))
    .map((s) => s.src)
    .filter((src) => src.includes('squarecdn.com'));
}

afterEach(() => {
  cleanup();
  document.head
    .querySelectorAll('script')
    .forEach((s) => s.src.includes('squarecdn.com') && s.remove());
  // Ensure each case takes the "load the SDK script" path.
  delete (window as { Square?: unknown }).Square;
});

const SANDBOX_CDN = 'https://sandbox.web.squarecdn.com/v1/square.js';
const PROD_CDN = 'https://web.squarecdn.com/v1/square.js';

const noop = () => undefined;

describe('SquareCardForm SDK environment selection', () => {
  it('loads the SANDBOX CDN for a sandbox App ID when no env is given', () => {
    render(
      <SquareCardForm
        applicationId="sandbox-sq0idb-abc123"
        locationId="LOC1"
        onTokenizeRef={noop}
      />
    );
    expect(injectedSquareScriptSrcs()).toContain(SANDBOX_CDN);
    expect(injectedSquareScriptSrcs()).not.toContain(PROD_CDN);
  });

  it('loads the PRODUCTION CDN for a production App ID when no env is given', () => {
    render(
      <SquareCardForm
        applicationId="sq0idp-xyz789"
        locationId="LOC1"
        onTokenizeRef={noop}
      />
    );
    expect(injectedSquareScriptSrcs()).toContain(PROD_CDN);
    expect(injectedSquareScriptSrcs()).not.toContain(SANDBOX_CDN);
  });

  it('is decoupled from the data backend: a sandbox App ID stays on the sandbox CDN even though the widget reads prod data (no env prop)', () => {
    // Mirrors the MT widget's usage: env drives the Firebase project, not this
    // form. With env omitted, only the App ID decides the SDK environment.
    render(
      <SquareCardForm
        applicationId="sandbox-sq0idb-mt-account"
        locationId="LKZXV01GJ3SZP"
        onTokenizeRef={noop}
      />
    );
    expect(injectedSquareScriptSrcs()).toContain(SANDBOX_CDN);
  });

  it('still honors an explicit env override for backwards compatibility', () => {
    // Legacy behavior: an explicit env wins over the App ID prefix.
    render(
      <SquareCardForm
        applicationId="sandbox-sq0idb-abc123"
        locationId="LOC1"
        env="prod"
        onTokenizeRef={noop}
      />
    );
    expect(injectedSquareScriptSrcs()).toContain(PROD_CDN);
  });
});

/**
 * Locks the card-on-file contract that a real-Square e2e (#622) had to catch:
 * vaulting a card requires a STORE-intent `verifyBuyer` token in addition to
 * the tokenize nonce. `verifyBuyerForStore` must produce it; a one-time charge
 * (default) must NOT call verifyBuyer.
 */
describe('SquareCardForm buyer verification (card on file)', () => {
  function installFakeSquare() {
    const tokenize = vi.fn().mockResolvedValue({
      status: 'OK',
      token: 'cnon:card-nonce',
    });
    const verifyBuyer = vi.fn().mockResolvedValue({ token: 'verf:store-token' });
    const card = {
      attach: vi.fn().mockResolvedValue(undefined),
      tokenize,
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const payments = {
      card: vi.fn().mockResolvedValue(card),
      verifyBuyer,
    };
    (window as unknown as { Square: unknown }).Square = {
      payments: vi.fn().mockResolvedValue(payments),
    };
    return { verifyBuyer };
  }

  it('runs verifyBuyer({ intent: STORE }) and returns its token alongside the nonce when verifyBuyerForStore is set', async () => {
    const { verifyBuyer } = installFakeSquare();
    let tokenize: (() => Promise<CardTokenizeResult>) | undefined;

    render(
      <SquareCardForm
        applicationId="sandbox-sq0idb-abc123"
        locationId="LOC1"
        totalCents={13200}
        verifyBuyerForStore
        billingContact={{ givenName: 'Jamie', email: 'jamie@test.com' }}
        onTokenizeRef={(fn) => {
          tokenize = fn;
        }}
      />
    );

    await waitFor(() => expect(tokenize).toBeDefined());

    const result = await tokenize!();
    expect(result).toEqual({
      nonce: 'cnon:card-nonce',
      verificationToken: 'verf:store-token',
    });
    expect(verifyBuyer).toHaveBeenCalledWith(
      'cnon:card-nonce',
      expect.objectContaining({ intent: 'STORE' })
    );
  });

  it('does NOT call verifyBuyer for a one-time charge (verifyBuyerForStore unset)', async () => {
    const { verifyBuyer } = installFakeSquare();
    let tokenize: (() => Promise<CardTokenizeResult>) | undefined;

    render(
      <SquareCardForm
        applicationId="sandbox-sq0idb-abc123"
        locationId="LOC1"
        totalCents={25200}
        onTokenizeRef={(fn) => {
          tokenize = fn;
        }}
      />
    );

    await waitFor(() => expect(tokenize).toBeDefined());

    const result = await tokenize!();
    expect(result).toEqual({ nonce: 'cnon:card-nonce', verificationToken: undefined });
    expect(verifyBuyer).not.toHaveBeenCalled();
  });
});

/**
 * Locks the observability + fallback contract added after a Safari/ITP field
 * report: Square's `InitializationTimeoutError` ("Web Payments SDK was unable to
 * be initialized in time") used to be swallowed into an Alert with no telemetry.
 * It must now console.error, GA-beacon, invoke `onInitError`, and show an
 * actionable message — while ordinary init errors keep their raw message.
 */
describe('SquareCardForm init failure telemetry', () => {
  afterEach(() => {
    delete (window as { gtag?: unknown }).gtag;
  });

  it('reports InitializationTimeoutError via console, gtag, onInitError, and an actionable message', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    (window as unknown as { Square: unknown }).Square = {
      payments: vi.fn().mockRejectedValue({
        name: 'Error',
        type: 'InitializationTimeoutError',
        message: 'Web Payments SDK was unable to be initialized in time',
      }),
    };
    const onInitError = vi.fn();

    render(
      <SquareCardForm
        applicationId="sq0idp-xyz789"
        locationId="LOC1"
        totalCents={25200}
        onInitError={onInitError}
        onTokenizeRef={noop}
      />
    );

    await waitFor(() => expect(onInitError).toHaveBeenCalled());

    const info = onInitError.mock.calls[0][0] as SquareInitErrorInfo;
    expect(info.isInitTimeout).toBe(true);
    expect(info.errorType).toBe('InitializationTimeoutError');
    expect(info.applicationId).toBe('sq0idp-xyz789');

    expect(gtag).toHaveBeenCalledWith(
      'event',
      'payment_init_failed',
      expect.objectContaining({ is_init_timeout: true, square_env: 'prod' })
    );
    expect(consoleSpy).toHaveBeenCalled();

    // Actionable fallback, not the raw SDK string.
    await screen.findByText(/secure payment form/i);
    expect(
      screen.queryByText(/unable to be initialized/i)
    ).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('keeps the raw message (no ITP guidance) for a non-timeout init error', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    (window as unknown as { Square: unknown }).Square = {
      payments: vi.fn().mockRejectedValue(new Error('Square location is invalid')),
    };
    const onInitError = vi.fn();

    render(
      <SquareCardForm
        applicationId="sq0idp-xyz789"
        locationId="LOC1"
        totalCents={25200}
        onInitError={onInitError}
        onTokenizeRef={noop}
      />
    );

    await waitFor(() => expect(onInitError).toHaveBeenCalled());

    const info = onInitError.mock.calls[0][0] as SquareInitErrorInfo;
    expect(info.isInitTimeout).toBe(false);
    await screen.findByText(/Square location is invalid/i);

    consoleSpy.mockRestore();
  });
});

/**
 * Locks the self-healing recovery for the corrupt-cache case a HAR confirmed:
 * `square.js` served empty from cache (304 revalidation of a poisoned entry) →
 * the <script> `onload` fires but `window.Square` is never defined. The loader
 * must retry once under a cache-busting URL (a fresh cache key forced to the
 * network) so it recovers without anyone clearing their cache.
 */
describe('SquareCardForm corrupt-cache SDK recovery', () => {
  function squareScripts(): HTMLScriptElement[] {
    return Array.from(document.head.querySelectorAll('script')).filter((s) =>
      s.src.includes('squarecdn.com')
    );
  }

  /** Install a working fake Square global (so init succeeds after recovery). */
  function installWorkingSquare() {
    const card = {
      attach: vi.fn().mockResolvedValue(undefined),
      tokenize: vi.fn().mockResolvedValue({ status: 'OK', token: 'cnon:x' }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    (window as unknown as { Square: unknown }).Square = {
      payments: vi.fn().mockResolvedValue({ card: vi.fn().mockResolvedValue(card) }),
    };
  }

  it('retries with a cache-busted URL when the first square.js load defines no window.Square', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <SquareCardForm
        applicationId="sq0idp-xyz789"
        locationId="LOC1"
        totalCents={6000}
        onTokenizeRef={noop}
      />
    );

    // Plain URL injected first; window.Square still undefined (corrupt cache).
    const first = squareScripts().at(-1)!;
    expect(first.src).toBe(PROD_CDN);
    expect((window as { Square?: unknown }).Square).toBeUndefined();

    // Simulate the empty cached script "loading" without defining the global.
    first.dispatchEvent(new Event('load'));

    // Loader must inject a cache-busted retry under the prod CDN.
    await waitFor(() => {
      expect(
        squareScripts().some((s) => s.src.startsWith(`${PROD_CDN}?_cb=`))
      ).toBe(true);
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('recovers and initializes once the cache-busted retry defines window.Square', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onReady = vi.fn();
    render(
      <SquareCardForm
        applicationId="sq0idp-xyz789"
        locationId="LOC1"
        totalCents={6000}
        onReady={onReady}
        onTokenizeRef={noop}
      />
    );

    // First (empty) load fires without a global.
    squareScripts().at(-1)!.dispatchEvent(new Event('load'));

    // Wait for the cache-busted retry script, then have it define window.Square.
    await waitFor(() =>
      expect(
        squareScripts().some((s) => s.src.startsWith(`${PROD_CDN}?_cb=`))
      ).toBe(true)
    );
    installWorkingSquare();
    squareScripts().at(-1)!.dispatchEvent(new Event('load'));

    // SDK now ready → init runs → onReady fires. No error surfaced.
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(screen.queryByText(/Failed to load payment form/i)).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
