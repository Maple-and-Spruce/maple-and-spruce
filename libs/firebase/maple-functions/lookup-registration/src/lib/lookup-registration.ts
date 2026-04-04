/**
 * Lookup Registration Cloud Function
 *
 * Public endpoint (no auth required).
 * Allows customers to look up their registration using their
 * confirmation number and email address.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions } from '@maple/firebase/functions';
import {
  RegistrationRepository,
  ClassRepository,
} from '@maple/firebase/database';
import type {
  LookupRegistrationRequest,
  LookupRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const lookupRegistration = Functions.endpoint.handle<
  LookupRegistrationRequest,
  LookupRegistrationResponse
>(async (data) => {
  if (!data.confirmationNumber || !data.customerEmail) {
    throw new Error('Confirmation number and email are required');
  }

  const registration = await RegistrationRepository.findByConfirmationNumber(
    data.confirmationNumber
  );

  // Don't reveal whether the confirmation number exists —
  // always return the same error for mismatches
  if (
    !registration ||
    registration.customerEmail.toLowerCase() !==
      data.customerEmail.toLowerCase()
  ) {
    throw new Error(
      'No registration found. Please check your confirmation number and email address.'
    );
  }

  // Enrich with class details
  const classEntity = await ClassRepository.findById(registration.classId);

  return {
    registration,
    className: classEntity?.name ?? 'Unknown Class',
    classDate: classEntity?.dateTime?.toISOString() ?? '',
    classLocation: classEntity?.location ?? 'Maple & Spruce Folk Arts Collective',
  };
});
