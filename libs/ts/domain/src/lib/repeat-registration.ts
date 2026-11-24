/**
 * A second class registration by the same email.
 *
 * Registering is one request that reserves a spot and charges the card. When
 * that request is slow, a buyer may press pay again, reload and start over, or
 * open the page in another tab, and each of those is a new registration and a
 * new charge. So the server refuses a second registration for a class by an
 * email that already holds one, and says which of two things is going on.
 *
 * The callable carries only a message to the browser, so these sentences are
 * also how the checkout form recognises the case.
 */

/**
 * This email already has a confirmed registration for the class. A family
 * can mean it (another child, a friend), so the form offers to go ahead.
 */
export const ALREADY_REGISTERED_MESSAGE =
  'This email is already registered for this class. Check your inbox for the confirmation. If you meant to sign up again, for example for another person, choose Register again.';

/**
 * A registration by this email is still being paid for: a card payment in
 * flight, or a Square checkout page not yet finished. Paying again now could
 * charge twice, so there is no way past this one but to wait.
 */
export const REGISTRATION_IN_PROGRESS_MESSAGE =
  'A payment for this class with this email is still going through. Please check your email for a confirmation before trying again. If none arrives within 15 minutes, you can try again then.';

/** Whether a checkout error is the "already registered" refusal. */
export function isAlreadyRegisteredMessage(message: string): boolean {
  return message.startsWith(ALREADY_REGISTERED_MESSAGE.slice(0, 50));
}

/** Whether a checkout error is the "still going through" refusal. */
export function isRegistrationInProgressMessage(message: string): boolean {
  return message.startsWith(REGISTRATION_IN_PROGRESS_MESSAGE.slice(0, 50));
}

/** Emails compared the way a person would: case and outer spaces ignored. */
export function sameEmail(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = a.trim().toLowerCase();
  return left !== '' && left === b.trim().toLowerCase();
}
