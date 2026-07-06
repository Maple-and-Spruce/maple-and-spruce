// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SquareCardForm } from './SquareCardForm';

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
