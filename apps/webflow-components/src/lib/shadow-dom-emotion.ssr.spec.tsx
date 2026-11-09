// @vitest-environment node
/**
 * Webflow's server render of a code component, kept as a fixture for
 * `shadow-dom-emotion.spec.tsx` to hydrate. With no `document`, Emotion writes
 * its styles as inline `<style>` tags, which is what breaks hydration.
 *
 * The widget changed? Refresh it with `npx vitest run <this file> -u`.
 */
import { it, expect, vi } from 'vitest';
import { Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { CancelRegistrationWidget } from '../CancelRegistrationWidget';
import { shadowDomEmotionDecorator } from './shadow-dom-emotion';

vi.mock('../firebase-init', () => ({
  getWidgetFunctions: () => ({}),
  routeCallable: () => () => Promise.resolve({ data: { found: false } }),
}));
vi.mock('@webflow/react', () => ({
  useWebflowContext: () => ({ mode: 'publish' }),
}));

it('server-renders with inline Emotion styles', async () => {
  const Widget = shadowDomEmotionDecorator(CancelRegistrationWidget);
  const html = renderToString(
    <Suspense>
      <Widget env="prod" />
    </Suspense>
  );
  expect(html).toContain('<style data-emotion=');
  await expect(html).toMatchFileSnapshot('./__fixtures__/cancel-registration.ssr.html');
});
