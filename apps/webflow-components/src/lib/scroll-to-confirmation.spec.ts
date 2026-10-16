// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIRMATION_SCROLL_OFFSET_PX,
  scrollToConfirmation,
} from './scroll-to-confirmation';

function elementAt(top: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ top }) as DOMRect;
  return el;
}

describe('scrollToConfirmation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('scrolls the confirmation to just below the sticky header', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { value: 1800, configurable: true });

    scrollToConfirmation(elementAt(-1200));

    expect(scrollTo).toHaveBeenCalledWith({
      top: 1800 - 1200 - CONFIRMATION_SCROLL_OFFSET_PX,
      behavior: 'smooth',
    });
  });

  it('jumps instead of animating while the page is in a background tab', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });

    scrollToConfirmation(elementAt(500));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('never scrolls above the top of the page', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });

    scrollToConfirmation(elementAt(40));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('does nothing without an element', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    scrollToConfirmation(null);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
