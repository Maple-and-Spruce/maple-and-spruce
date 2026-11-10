/**
 * Emotion decorator for our Webflow code components. Use it in place of
 * `emotionShadowDomDecorator` from `@webflow/emotion-utils`.
 *
 * Webflow server-renders each component inside a `<code-island>` shadow root.
 * On the server Emotion writes every style as an inline `<style>` tag beside the
 * element it styles. In the browser Emotion renders no such tags, so React finds
 * nodes it did not render and throws a hydration error (#418), then throws the
 * server HTML away and renders the widget again from scratch.
 *
 * Emotion normally moves its server styles out of the way before hydrating,
 * but it only searches `document`, and these tags are inside shadow roots. So we
 * move them ourselves: out of the hydrated tree and to the top of the shadow
 * root. They keep styling the server HTML, and React sees the tree it renders.
 */
import type { ComponentType } from 'react';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';

/**
 * Move Emotion's server-rendered `<style>` tags out of every code component's
 * hydrated tree. Safe to call repeatedly: once a tree has been cleared there is
 * nothing left to move.
 */
export function liftServerRenderedStyles(doc: Document = document): void {
  for (const island of Array.from(doc.querySelectorAll('code-island'))) {
    const shadow = island.shadowRoot;
    if (!shadow) continue;
    // The tree Webflow hydrates. (`:scope >` is not reliable on a shadow root.)
    const root = Array.from(shadow.children).find((el) => el.hasAttribute('data-root'));
    if (!root) continue;
    for (const style of Array.from(root.querySelectorAll('style[data-emotion]'))) {
      shadow.insertBefore(style, root);
    }
  }
}

/**
 * `emotionShadowDomDecorator`, plus the style lift above.
 *
 * The lift runs here, when `declareComponent` applies the decorator, which is
 * when Webflow loads the component's module and so before it hydrates the
 * island. It cannot wait for a render: on entering the tree React has already
 * picked the first server node to hydrate, and that node is a `<style>`.
 */
export function shadowDomEmotionDecorator<P extends object>(
  Component: ComponentType<P>
): ComponentType<P> {
  if (typeof document !== 'undefined') liftServerRenderedStyles();
  return emotionShadowDomDecorator(Component);
}
