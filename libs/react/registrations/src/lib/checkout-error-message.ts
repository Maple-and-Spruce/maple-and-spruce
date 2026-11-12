/**
 * What to tell a family when the pay request itself failed.
 *
 * A reply from our own function carries a sentence written for them, and that
 * is shown as it is. But when the request never got an answer (no connection,
 * the server was busy, it timed out), Firebase's client reports only a code
 * word: "internal", "unavailable", "deadline-exceeded". Those are replaced
 * here, and the replacement depends on whether the card could have been
 * charged.
 */
import { customerFacingMessage } from './customer-facing-message';

/** Something failed and we know nothing more. */
export const CHECKOUT_FALLBACK_MESSAGE =
  'Something went wrong processing your payment. Please try again.';

/** The request was turned away before it ran, so nothing was charged. */
export const CHECKOUT_BUSY_MESSAGE =
  'We are a little busy right now, and your card was not charged. Please try again in a moment.';

/** The request may have run. Trying again blind could charge twice. */
export const CHECKOUT_UNCONFIRMED_MESSAGE =
  'We could not confirm your payment. Please check your email for a confirmation before trying again.';

/**
 * Code words Firebase uses as the whole message when there is no reply to
 * read, and what each one means for the buyer.
 */
const BARE_CODE_MESSAGES: Record<string, string> = {
  // 429 or 503 from the platform: no instance took the request.
  'resource-exhausted': CHECKOUT_BUSY_MESSAGE,
  unavailable: CHECKOUT_BUSY_MESSAGE,
  // The request left the browser and the answer never came back.
  'deadline-exceeded': CHECKOUT_UNCONFIRMED_MESSAGE,
  internal: CHECKOUT_UNCONFIRMED_MESSAGE,
  cancelled: CHECKOUT_UNCONFIRMED_MESSAGE,
  aborted: CHECKOUT_UNCONFIRMED_MESSAGE,
  unknown: CHECKOUT_FALLBACK_MESSAGE,
};

/** How the server's "charged, but the registration was not saved" reply begins. */
const PAID_PREFIX = 'Your payment went through';

/**
 * Whether this message means the card may already have been charged. Such a
 * failure must never be followed by advice to try another card or pay
 * somewhere else.
 */
export function mayAlreadyBePaid(message: string): boolean {
  return (
    message === CHECKOUT_UNCONFIRMED_MESSAGE || message.startsWith(PAID_PREFIX)
  );
}

interface ErrorLike {
  code?: unknown;
  message?: unknown;
}

/** The customer-facing sentence for anything the pay request threw. */
export function checkoutErrorMessage(error: unknown): string {
  if (!error) return CHECKOUT_FALLBACK_MESSAGE;
  const { code, message } = error as ErrorLike;
  const text =
    typeof message === 'string' ? customerFacingMessage(message) : '';

  const bare = BARE_CODE_MESSAGES[text.toLowerCase().replace(/_/g, '-')];
  if (bare) return bare;
  if (text) return text;

  // No message at all: go by the code ("functions/unavailable").
  const codeWord =
    typeof code === 'string' ? code.replace(/^functions\//, '') : '';
  return BARE_CODE_MESSAGES[codeWord] ?? CHECKOUT_FALLBACK_MESSAGE;
}
