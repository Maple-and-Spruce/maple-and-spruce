/**
 * A second Music Together signup for the same section by the same family.
 *
 * Signing up is one request that reserves a family spot and charges the card.
 * When that request is slow, a parent may press pay again, reload and start
 * over, or open the page in another tab, and each of those used to be a new
 * registration and a new charge. So the server refuses the repeat.
 *
 * Unlike a class, the same email signing up twice for one section is often
 * real: a parent enrolls one child, and later a sibling. So a confirmed signup
 * only blocks a new one when they share a child (same email, same child's
 * name). A signup that is still being paid for blocks any new one by that
 * email, because a retried form may have a corrected spelling and would slip
 * past the name match into a second charge.
 *
 * The callable carries only a message to the browser, so these sentences are
 * also how the signup widget recognises the case.
 */
import { sameEmail } from './repeat-registration';

/**
 * This email already has this child enrolled in the section. A family can
 * mean it, so the widget offers to go ahead.
 */
export const MT_ALREADY_ENROLLED_MESSAGE =
  'This child is already signed up for this section with this email. Check your inbox for the confirmation. If you meant to sign up again, choose Register again.';

/**
 * A signup by this email for the section is still being paid for. Paying
 * again now could charge twice, so there is no way past this one but to wait.
 */
export const MT_SIGNUP_IN_PROGRESS_MESSAGE =
  'A payment for this section with this email is still going through. Please check your email for a confirmation before trying again. If none arrives within 15 minutes, you can try again then.';

/**
 * How long a `pending` signup counts as "still being paid for". A payment that
 * fails cancels its signup at once, so a pending one older than this was cut
 * off mid-way (a crash or a timeout) and may or may not have been charged.
 * After this it is treated like a confirmed one: it blocks the same child
 * unless the family chooses Register again, and stops blocking siblings.
 */
export const MT_SIGNUP_IN_PROGRESS_MS = 15 * 60 * 1000;

/** What the server knows about an earlier signup for the same section. */
export interface MtEarlierSignup {
  email: unknown;
  status: unknown;
  createdAt?: Date | null;
  children?: ReadonlyArray<{ name?: unknown }> | null;
}

/** What makes a new signup a repeat of an earlier one, if anything. */
export type MtRepeatSignup = 'in-progress' | 'already-enrolled' | null;

/** A child's name compared the way a person would. */
function childKey(name: unknown): string {
  return typeof name === 'string'
    ? name.trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
}

/**
 * Whether a new signup repeats one already held for the section.
 *
 * `earlier` is every signup that holds a spot in the section (pending or
 * confirmed). Cancelled ones are not passed in, so a family that cancelled
 * can sign up again.
 */
export function findMtRepeatSignup(
  earlier: readonly MtEarlierSignup[],
  request: {
    email: string;
    children: ReadonlyArray<{ name: string }>;
    registerAgain?: boolean;
  },
  now: Date
): MtRepeatSignup {
  const sameFamily = earlier.filter((held) =>
    sameEmail(held.email, request.email)
  );
  if (sameFamily.length === 0) return null;

  const inProgress = sameFamily.some(
    (held) =>
      held.status === 'pending' &&
      // No timestamp: assume it is recent rather than risk a second charge.
      (!held.createdAt ||
        now.getTime() - held.createdAt.getTime() < MT_SIGNUP_IN_PROGRESS_MS)
  );
  if (inProgress) return 'in-progress';

  if (request.registerAgain) return null;
  const wanted = new Set(
    request.children.map((c) => childKey(c.name)).filter((k) => k !== '')
  );
  const sharesChild = sameFamily.some((held) =>
    (held.children ?? []).some((c) => wanted.has(childKey(c.name)))
  );
  return sharesChild ? 'already-enrolled' : null;
}

/** Whether a signup error is the "already signed up" refusal. */
export function isMtAlreadyEnrolledMessage(message: string): boolean {
  return message.startsWith(MT_ALREADY_ENROLLED_MESSAGE.slice(0, 50));
}

/** Whether a signup error is the "still going through" refusal. */
export function isMtSignupInProgressMessage(message: string): boolean {
  return message.startsWith(MT_SIGNUP_IN_PROGRESS_MESSAGE.slice(0, 50));
}
