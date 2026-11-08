/**
 * Request Registration Cancellation Cloud Function (public)
 *
 * The website's cancel page sends this when a customer asks to cancel a class
 * registration before its free cancellation date (two weeks before the
 * class). It does NOT cancel or refund anything. It:
 *
 * 1. records `cancellationRequestedAt` on the registration, which puts a
 *    "Cancel request" item on Katie's Home Inbox;
 * 2. emails Katie (ADMIN_ALERT_EMAIL) with a link to the class roster, where
 *    the existing Cancel button refunds it;
 * 3. emails the customer that the request reached us.
 *
 * After the deadline, or for a booking that does not match, it answers the
 * same `failed-precondition` either way and records nothing. The page never
 * offers the button then, so this only guards a stale page or a direct call.
 *
 * Its own function (not a route): the public writes stay with their domain,
 * and class registrations have no router (ADR-029).
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  Functions,
  emailLinkThrottles,
  queueMail,
  throwFailedPrecondition,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import {
  formatFreeCancellationDeadline,
  formatSessions,
  isPrivateHoursClass,
  formatPrivateHour,
  type Class,
  type Registration,
} from '@maple/ts/domain';
import type {
  RequestRegistrationCancellationRequest,
  RequestRegistrationCancellationResponse,
} from '@maple/ts/firebase/api-types';
import { findRegistrationForCancellation } from './find-registration-for-cancellation';

const NOT_CANCELLABLE =
  'We could not find a registration that can be cancelled online. Please email Katie.';

function classDateText(
  classEntity: Class | undefined,
  registration: Registration
): string | undefined {
  if (!classEntity) return undefined;
  if (registration.slotStart && isPrivateHoursClass(classEntity)) {
    return formatPrivateHour(registration.slotStart, classEntity.durationMinutes);
  }
  const { dateDisplay, timeDisplay } = formatSessions(
    classEntity.sessions,
    'America/New_York'
  );
  return timeDisplay && timeDisplay !== 'Varies'
    ? `${dateDisplay} · ${timeDisplay}`
    : dateDisplay;
}

export async function handleRequestRegistrationCancellation(
  data: RequestRegistrationCancellationRequest,
  strings: { ADMIN_ALERT_EMAIL?: string; ADMIN_PORTAL_URL?: string },
  now: Date = new Date()
): Promise<RequestRegistrationCancellationResponse> {
  if (!data?.confirmationNumber?.trim()) {
    throwInvalidArgument('Confirmation number is required');
  }
  if (!data?.email?.trim()) throwInvalidArgument('Email is required');

  const found = await findRegistrationForCancellation(
    data.confirmationNumber,
    data.email,
    now
  );
  if (!found || !found.freeCancellationUntil) {
    throwFailedPrecondition(NOT_CANCELLABLE);
  }
  const { registration, classEntity, freeCancellationUntil } = found;

  const recorded = await RegistrationRepository.markCancellationRequested(
    registration.id,
    now
  );
  // Already asked (a second click, a second tab): same answer, no new email.
  if (!recorded) {
    return { ok: true, freeCancellationUntil: freeCancellationUntil.toISOString() };
  }

  const className = classEntity?.name ?? 'your class';
  const deadline = formatFreeCancellationDeadline(freeCancellationUntil);
  const classDate = classDateText(classEntity, registration);
  const amountPaid = `$${(registration.pricePaidCents / 100).toFixed(2)}`;

  // Each email on its own: the request is recorded and on the Inbox, so a
  // mail failure must not turn it into an error the customer retries.
  if (strings.ADMIN_ALERT_EMAIL) {
    try {
      await queueMail({
        to: strings.ADMIN_ALERT_EMAIL,
        templateName: 'registration-cancellation-request-staff',
        sender: 'maple-spruce',
        data: {
          className,
          classDate,
          customerName: registration.customerName,
          customerEmail: registration.customerEmail,
          confirmationNumber: registration.confirmationNumber,
          quantity: registration.quantity,
          amountPaid,
          freeCancellationUntil: deadline,
          rosterUrl: strings.ADMIN_PORTAL_URL
            ? `${strings.ADMIN_PORTAL_URL}/classes/${registration.classId}/roster`
            : undefined,
        },
      });
    } catch (error) {
      console.error('[requestRegistrationCancellation] staff email failed', error);
    }
  }
  try {
    await queueMail({
      to: registration.customerEmail,
      templateName: 'registration-cancellation-requested',
      sender: 'maple-spruce',
      data: {
        customerName: registration.customerName,
        className,
        classDate,
        confirmationNumber: registration.confirmationNumber,
        freeCancellationUntil: deadline,
      },
    });
  } catch (error) {
    console.error('[requestRegistrationCancellation] customer email failed', error);
  }

  console.log(
    `[requestRegistrationCancellation] Registration ${registration.id} asked to cancel (deadline ${freeCancellationUntil.toISOString()}).`
  );
  return { ok: true, freeCancellationUntil: freeCancellationUntil.toISOString() };
}

export const requestRegistrationCancellation = Functions.endpoint
  .withAppCheck('enforce')
  .throttling('requestRegistrationCancellation', emailLinkThrottles())
  .usingStrings('ADMIN_ALERT_EMAIL', 'ADMIN_PORTAL_URL')
  .handle<
    RequestRegistrationCancellationRequest,
    RequestRegistrationCancellationResponse
  >((data, _context, _secrets, strings) =>
    handleRequestRegistrationCancellation(data, strings)
  );
