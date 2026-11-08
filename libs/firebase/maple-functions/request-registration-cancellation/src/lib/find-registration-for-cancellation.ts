/**
 * Shared by the cancel page's two calls: `publicSite/lookupRegistrationForCancellation`
 * (what to show) and `requestRegistrationCancellation` (the ask).
 *
 * A registration is found only by its confirmation number AND the email it
 * was booked with, and only while it is confirmed. Confirmation numbers are
 * six characters, so the email is what stops a stranger guessing a booking.
 * Anything else (wrong email, cancelled, refunded, no such number) is the
 * same "not found", so the answer reveals nothing.
 */
import {
  ClassRepository,
  RegistrationRepository,
} from '@maple/firebase/database';
import {
  cancellationAnchor,
  freeCancellationUntil,
  normalizeConfirmationNumber,
  type Class,
  type Registration,
} from '@maple/ts/domain';
import type { LookupRegistrationForCancellationResponse } from '@maple/ts/firebase/api-types';

export interface RegistrationForCancellation {
  registration: Registration;
  classEntity: Class | undefined;
  /** When the two weeks count back from (first session or booked hour). */
  startsAt: Date | undefined;
  /** The deadline, only while it is still ahead. */
  freeCancellationUntil: Date | undefined;
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function findRegistrationForCancellation(
  confirmationNumber: string,
  email: string,
  now: Date
): Promise<RegistrationForCancellation | undefined> {
  const number = normalizeConfirmationNumber(confirmationNumber ?? '');
  if (!number || !email?.trim()) return undefined;

  const candidates = await RegistrationRepository.findByConfirmationNumber(number);
  const registration = candidates.find(
    (r) =>
      r.status === 'confirmed' &&
      // Class registrations only. POS sales have no web confirmation email.
      r.source !== 'pos' &&
      sameEmail(r.customerEmail, email)
  );
  if (!registration) return undefined;

  const classEntity = await ClassRepository.findById(registration.classId);
  const sessions = classEntity?.sessions ?? [];
  return {
    registration,
    classEntity,
    startsAt: cancellationAnchor(sessions, registration.slotStart),
    freeCancellationUntil: freeCancellationUntil(
      { sessions, slotStart: registration.slotStart },
      now
    ),
  };
}

/**
 * The cancel page's lookup. Public, read-only. Takes only the request, so it
 * can be a router route as is (a route is also handed the call context).
 */
export function lookupRegistrationForCancellation(data: {
  confirmationNumber: string;
  email: string;
}): Promise<LookupRegistrationForCancellationResponse> {
  return lookupRegistrationForCancellationAt(data, new Date());
}

/** The lookup as of `now`. */
export async function lookupRegistrationForCancellationAt(
  data: { confirmationNumber: string; email: string },
  now: Date
): Promise<LookupRegistrationForCancellationResponse> {
  const found = await findRegistrationForCancellation(
    data?.confirmationNumber,
    data?.email,
    now
  );
  if (!found) return { found: false };
  return {
    found: true,
    className: found.classEntity?.name ?? 'your class',
    startsAt: found.startsAt?.toISOString(),
    freeCancellationUntil: found.freeCancellationUntil?.toISOString(),
    cancellationRequested: found.registration.cancellationRequestedAt !== undefined,
  };
}
