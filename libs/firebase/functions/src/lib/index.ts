/**
 * Firebase Functions utilities
 *
 * Core utilities for creating Firebase Cloud Functions with consistent
 * patterns for authentication, authorization, and error handling.
 *
 * @example
 * import { createAdminFunction, Role, throwNotFound } from '@maple/firebase/functions';
 *
 * export const createArtist = createAdminFunction<CreateArtistInput, Artist>(
 *   async (data, context) => {
 *     const artist = await ArtistRepository.create(data);
 *     return artist;
 *   }
 * );
 */

// Function builders
export {
  Functions,
  createFunction,
  createPublicFunction,
  createAuthenticatedFunction,
  createAdminFunction,
  createRoleFunction,
  assertValid,
  runChecks,
  type FunctionContext,
  type FunctionOptions,
  type RuntimeOptions,
  type ValidationResultLike,
  type ValidatorFn,
  type UniquenessCheck,
} from './functions.utility';

// Auth utilities
export {
  Role,
  hasRole,
  hasAnyRole,
  getUserRoles,
  getAllUserRoles,
  grantRole,
  revokeRole,
  grantAdminRole,
  revokeAdminRole,
  getAdminUids,
} from './auth.utility';

// Error utilities
export {
  ErrorCode,
  throwNotFound,
  throwAlreadyExists,
  throwInvalidArgument,
  throwValidationError,
  throwFailedPrecondition,
  throwPermissionDenied,
} from './errors.utility';

// Resource-ownership checks (scoped-roles phase 2)
export {
  instructorIdForUser,
  instructorScopeForUser,
  assertOwnsAsInstructor,
  assertCanManageLesson,
  assertCanManageStudent,
  assertCanRecordInvoicePayment,
} from './ownership.utility';

// Lesson ↔ block enforcement (#686)
export { assertLessonsFitBlock } from './lesson-block.utility';

// Environment utilities
export {
  FirebaseProject,
  FIREBASE_PROJECTS,
  ServiceEnvironment,
  type EnvironmentMode,
  type FirebaseProjectId,
} from './environment.utility';

// Email utilities
export { isE2ETestEmail } from './email.utility';
export { queueMail, type MailSender, type QueueMailInput } from './mail.utility';

// Shared class-registration reservation (card + hosted-checkout paths)
export {
  reserveClassRegistration,
  validateRequiredAgreements,
  generateConfirmationNumber,
  type ReserveRegistrationResult,
  type RegistrationReservationInput,
  type RegistrationClientContext,
} from './registration-reservation.utility';

// Shared inline-agreement processing (card + hosted-checkout paths)
export {
  processInlineAgreements,
  type InlineAgreementSigner,
} from './inline-agreements.utility';

// Per-family calendar subscription utilities
export {
  FAMILY_CALENDAR_FEED_PATH_PREFIX,
  generateFamilyCalendarToken,
  apiHostingHost,
  familyCalendarFeedUrl,
  familyCalendarSubscribeUrl,
} from './family-calendar.utility';
