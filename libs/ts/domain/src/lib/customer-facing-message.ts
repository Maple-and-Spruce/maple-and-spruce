/**
 * Error messages fit to show a person.
 *
 * Firebase's callable client adds the HTTP status to every error it builds
 * from a function's reply ("Your card was declined. [400]"), and Square's own
 * errors can carry one too. A status code means nothing to a family at
 * checkout or to staff, so it is dropped before a message is shown. Logs keep
 * the original.
 */

/** A trailing HTTP status code in brackets, e.g. "[400]" or "[HTTP 402]". */
const TRAILING_STATUS_CODE = /\[(?:HTTP ?)?[1-5]\d\d\]$/i;

/**
 * What Firebase reports when a function failed without saying why. A message
 * that is only one of these is replaced by the caller's own wording.
 */
const GENERIC_MESSAGES = new Set(['internal', 'unknown']);

/**
 * A message with any trailing bracketed status codes dropped. Returns an
 * empty string when nothing else is left, so the caller can fall back to its
 * own wording.
 */
export function customerFacingMessage(message: string): string {
  let text = message.trim();
  while (TRAILING_STATUS_CODE.test(text)) {
    text = text.replace(TRAILING_STATUS_CODE, '').trimEnd();
  }
  return text;
}

/**
 * What to show a person for an error: its message without a status code, or
 * `fallback` when there is no message or it is only a bare error code.
 */
export function errorMessageFor(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';
  const text = customerFacingMessage(raw);
  if (!text || GENERIC_MESSAGES.has(text.toLowerCase())) return fallback;
  return text;
}
