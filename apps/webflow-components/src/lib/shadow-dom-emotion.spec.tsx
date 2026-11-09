// @vitest-environment jsdom
/**
 * Hydrates a code component's server HTML the way the browser does on the live
 * site: inside a `<code-island>` shadow root. The fixture is the real server
 * render, produced by `shadow-dom-emotion.ssr.spec.tsx`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, Suspense, type ComponentType } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { CancelRegistrationWidget } from '../CancelRegistrationWidget';
import { liftServerRenderedStyles, shadowDomEmotionDecorator } from './shadow-dom-emotion';

const SERVER_HTML = readFileSync(
  resolve(__dirname, '__fixtures__/cancel-registration.ssr.html'),
  'utf8'
);

vi.mock('../firebase-init', () => ({
  getWidgetFunctions: () => ({}),
  routeCallable: () => () => Promise.resolve({ data: { found: false } }),
}));
vi.mock('@webflow/react', () => ({
  useWebflowContext: () => ({ mode: 'publish' }),
}));


function serveIsland(): { root: HTMLElement; shadow: ShadowRoot } {
  const island = document.createElement('code-island');
  document.body.appendChild(island);
  const shadow = island.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<div data-root="true" style="display:contents">${SERVER_HTML}</div>`;
  return { root: shadow.querySelector('[data-root]') as HTMLElement, shadow };
}

let reactRoot: Root | undefined;

async function hydrate(
  root: HTMLElement,
  Widget: ComponentType<{ env: string }>
): Promise<unknown[]> {
  const errors: unknown[] = [];
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => {
    reactRoot = hydrateRoot(
      root,
      <Suspense>
        <Widget env="prod" />
      </Suspense>,
      { onRecoverableError: (error) => errors.push(error) }
    );
  });
  consoleError.mockRestore();
  return errors;
}

describe('shadowDomEmotionDecorator', () => {
  afterEach(() => {
    act(() => reactRoot?.unmount());
    reactRoot = undefined;
    document.body.innerHTML = '';
  });

  it("is needed: Webflow's own decorator cannot hydrate its server HTML", async () => {
    const { root } = serveIsland();
    const errors = await hydrate(root, emotionShadowDomDecorator(CancelRegistrationWidget));
    expect(String(errors[0])).toMatch(/Hydration failed/);
  });

  it('hydrates the server HTML without a mismatch', async () => {
    // As on the live site: the server HTML is on the page before the
    // component's module loads and applies the decorator.
    const { root, shadow } = serveIsland();
    const errors = await hydrate(root, shadowDomEmotionDecorator(CancelRegistrationWidget));

    expect(errors).toEqual([]);
    // The server's styles still apply, from outside the hydrated tree.
    expect(root.querySelector('style[data-emotion]')).toBeNull();
    expect(
      Array.from(shadow.children).filter((el) => el.matches('style[data-emotion]')).length
    ).toBeGreaterThan(0);
    expect(root.querySelector('input[aria-label="Confirmation number"]')).not.toBeNull();
  });
});

describe('liftServerRenderedStyles', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves styles out of every island and leaves other styles alone', () => {
    const first = serveIsland();
    const second = serveIsland();
    const own = document.createElement('style');
    first.root.prepend(own);

    liftServerRenderedStyles();

    for (const { root, shadow } of [first, second]) {
      expect(root.querySelector('style[data-emotion]')).toBeNull();
      expect(shadow.firstElementChild?.tagName).toBe('STYLE');
    }
    expect(own.parentNode).toBe(first.root);
  });

  it('does nothing a second time', () => {
    const { shadow } = serveIsland();
    liftServerRenderedStyles();
    const before = shadow.innerHTML;
    liftServerRenderedStyles();
    expect(shadow.innerHTML).toBe(before);
  });
});
