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
  type FunctionContext,
  type FunctionOptions,
} from './functions.utility';

// Auth utilities
export { Role, hasRole, grantAdminRole, revokeAdminRole, getAdminUids } from './auth.utility';

// Error utilities
export {
  ErrorCode,
  throwNotFound,
  throwAlreadyExists,
  throwInvalidArgument,
  throwValidationError,
  throwFailedPrecondition,
} from './errors.utility';

// Environment utilities
export {
  ServiceEnvironment,
  secretPair,
  secretPairs,
  type EnvironmentMode,
} from './environment.utility';
