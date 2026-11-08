/**
 * A trailing HTTP status code in brackets, e.g. "[400]" or "[HTTP 402]".
 * Square's errors carry one, and it means nothing to a family at checkout.
 */
const TRAILING_STATUS_CODE = /\[(?:HTTP ?)?[1-5]\d\d\]$/i;

/**
 * An error message fit to show a customer: any trailing bracketed status
 * codes are dropped. Returns an empty string when nothing else is left, so
 * the caller can fall back to its own wording.
 */
export function customerFacingMessage(message: string): string {
  let text = message.trim();
  while (TRAILING_STATUS_CODE.test(text)) {
    text = text.replace(TRAILING_STATUS_CODE, '').trimEnd();
  }
  return text;
}
