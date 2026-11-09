// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { CancelRegistrationWidget } from './CancelRegistrationWidget';

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
  routeCallable: () => () => Promise.resolve({ data: { found: false } }),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => Promise.resolve({ data: {} }),
}));

function setUrl(search: string): void {
  window.history.replaceState(null, '', `/cancel${search}`);
}

/**
 * Webflow server-renders the widget, where there is no URL, then the browser
 * hydrates it. The browser's first render must match the server's HTML, or
 * React throws #418 and re-renders the whole widget on the client.
 */
describe('CancelRegistrationWidget hydration', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
    setUrl('');
  });

  it('hydrates without a mismatch, then fills the number from the link', async () => {
    // What Webflow's server renders: no ?confirmation= exists there.
    setUrl('');
    const serverHtml = renderToString(<CancelRegistrationWidget env="prod" />);

    // The visitor's browser, arriving from the email link.
    setUrl('?confirmation=MS-ABC234');
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    // React's dev build warns on console; the production build throws #418.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const recoverable = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, <CancelRegistrationWidget env="prod" />, {
        onRecoverableError: recoverable,
      });
    });
    const mismatches = consoleError.mock.calls.filter((args) =>
      args.some((a) => /hydrat|didn't match/i.test(String(a)))
    );
    consoleError.mockRestore();

    expect(recoverable).not.toHaveBeenCalled();
    expect(mismatches).toEqual([]);
    const field = container.querySelector<HTMLInputElement>(
      'input[aria-label="Confirmation number"]'
    );
    expect(field?.value).toBe('MS-ABC234');
  });

  it('uses the prop over the link', async () => {
    setUrl('?confirmation=MS-FROMURL');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const html = renderToString(
      <CancelRegistrationWidget env="prod" confirmationNumber="MS-PROP01" />
    );
    container.innerHTML = html;
    await act(async () => {
      root = hydrateRoot(
        container,
        <CancelRegistrationWidget env="prod" confirmationNumber="MS-PROP01" />
      );
    });
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Confirmation number"]'
      )?.value
    ).toBe('MS-PROP01');
  });
});
