/**
 * Space left above the confirmation so the site's sticky header and
 * announcement bar don't cover "You're Registered!".
 */
export const CONFIRMATION_SCROLL_OFFSET_PX = 120;

/**
 * Scroll the page so a just-shown confirmation is in view. On a phone the pay
 * button sits far below the top of the widget, and a buyer coming back from the
 * Apple Pay tab was left looking at the page footer.
 */
export function scrollToConfirmation(el: HTMLElement | null): void {
  if (!el || typeof window === 'undefined') return;
  const top =
    el.getBoundingClientRect().top +
    window.scrollY -
    CONFIRMATION_SCROLL_OFFSET_PX;
  // A smooth scroll can stall while the tab is in the background (the buyer is
  // still on the Apple Pay tab), so jump instead when the page is hidden.
  window.scrollTo({
    top: Math.max(0, top),
    behavior: document.hidden ? 'auto' : 'smooth',
  });
}
