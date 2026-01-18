/**
 * Firebase Cloud Functions utilities
 *
 * Provides a consistent pattern for creating callable functions with
 * authentication, authorization, and error handling.
 *
 * Pattern adapted from Mountain Sol Platform:
 * @see https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/functions.utility.ts
 */
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { Role, hasRole } from './auth.utility';

/**
 * Context provided to function handlers
 */
export interface FunctionContext {
  /** The authenticated user's UID, if any */
  uid?: string;
  /** The authenticated user's email, if any */
  email?: string;
}

/**
 * Options for creating a function
 */
export interface FunctionOptions {
  /** Require user to be authenticated */
  requireAuth?: boolean;
  /** Require user to have a specific role */
  requiredRole?: Role;
}

/**
 * Create a Firebase callable function with consistent patterns
 *
 * @param handler - The function implementation
 * @param options - Authentication and authorization options
 * @returns A Firebase callable function
 *
 * @example
 * // Simple authenticated function
 * export const getArtists = createFunction<void, Artist[]>(
 *   async (data, context) => {
 *     const artists = await ArtistRepository.findAll();
 *     return artists;
 *   },
 *   { requireAuth: true }
 * );
 *
 * @example
 * // Admin-only function
 * export const createArtist = createFunction<CreateArtistInput, Artist>(
 *   async (data, context) => {
 *     const artist = await ArtistRepository.create(data);
 *     return artist;
 *   },
 *   { requiredRole: Role.Admin }
 * );
 */
export function createFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>,
  options: FunctionOptions = {}
) {
  return onCall({ region: 'us-east4' }, async (request: CallableRequest<TRequest>): Promise<TResponse> => {
    const context: FunctionContext = {
      uid: request.auth?.uid,
      email: request.auth?.token?.email,
    };

    // Check authentication if required
    if (options.requireAuth || options.requiredRole) {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'You must be logged in to perform this action');
      }
    }

    // Check role if required
    if (options.requiredRole) {
      const userHasRole = await hasRole(request.auth!.uid, options.requiredRole);
      if (!userHasRole) {
        throw new HttpsError(
          'permission-denied',
          `You must be a ${options.requiredRole} to perform this action`
        );
      }
    }

    try {
      return await handler(request.data, context);
    } catch (error) {
      // Re-throw HttpsErrors as-is
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      console.error('Function error:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
    }
  });
}

/**
 * Create a public function (no authentication required)
 *
 * @example
 * export const getPublicInfo = createPublicFunction<void, PublicInfo>(
 *   async () => {
 *     return { version: '1.0.0' };
 *   }
 * );
 */
export function createPublicFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, {});
}

/**
 * Create an authenticated function (requires login)
 *
 * @example
 * export const getUserProfile = createAuthenticatedFunction<void, UserProfile>(
 *   async (data, context) => {
 *     return await UserRepository.findById(context.uid!);
 *   }
 * );
 */
export function createAuthenticatedFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, { requireAuth: true });
}

/**
 * Create an admin-only function
 *
 * @example
 * export const deleteArtist = createAdminFunction<{ id: string }, void>(
 *   async (data) => {
 *     await ArtistRepository.delete(data.id);
 *   }
 * );
 */
export function createAdminFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, { requiredRole: Role.Admin });
}
