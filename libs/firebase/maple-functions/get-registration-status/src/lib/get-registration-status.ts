/**
 * Get Registration Status Cloud Function
 *
 * Public lookup by registration id. Used when Square redirects a buyer back to
 * the class page (`?reg=<id>`) after a hosted checkout: the widget VERIFIES the
 * payment actually landed (the `payment.updated` webhook is the source of
 * truth) rather than trusting the query param, then shows a real confirmation
 * instead of a blank form — so a buyer who paid doesn't pay again.
 *
 * Confirmation details (name/email/class/amount) are returned ONLY for a
 * confirmed registration; other statuses return the status alone (no PII). The
 * registration id is a random Firestore id, so it isn't enumerable.
 *
 * Deployed to us-east4 (maple-core codebase) via CI/CD.
 */
import { Functions } from '@maple/firebase/functions';
import {
  RegistrationRepository,
  ClassRepository,
} from '@maple/firebase/database';
import type {
  GetRegistrationStatusRequest,
  GetRegistrationStatusResponse,
} from '@maple/ts/firebase/api-types';

export const getRegistrationStatus = Functions.endpoint.handle<
  GetRegistrationStatusRequest,
  GetRegistrationStatusResponse
>(async (data) => {
  if (!data.registrationId) {
    throw new Error('Registration ID is required');
  }

  const registration = await RegistrationRepository.findById(
    data.registrationId
  );
  if (!registration) {
    return { status: 'not-found' };
  }

  if (registration.status !== 'confirmed') {
    // Pending / cancelled / etc. — status only, no personal details.
    return { status: registration.status };
  }

  const classEntity = await ClassRepository.findById(registration.classId);

  return {
    status: 'confirmed',
    confirmation: {
      confirmationNumber: registration.confirmationNumber,
      className: classEntity?.name ?? 'your class',
      customerName: registration.customerName,
      customerEmail: registration.customerEmail,
      quantity: registration.quantity,
      pricePaidCents: registration.pricePaidCents,
    },
  };
});
