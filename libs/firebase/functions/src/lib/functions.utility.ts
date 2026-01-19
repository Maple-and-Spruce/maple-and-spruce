/**
 * Firebase Cloud Functions utilities
 *
 * Provides a consistent pattern for creating HTTP functions with
 * CORS handling, authentication, authorization, and secrets management.
 *
 * Uses onRequest (HTTP functions) with manual CORS middleware for full
 * control over CORS headers and preflight handling.
 *
 * Pattern adapted from Mountain Sol Platform:
 * @see https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/functions.utility.ts
 */
import { onRequest } from 'firebase-functions/v2/https';
import {
  defineString,
  defineSecret,
  type SecretParam,
  type StringParam,
} from 'firebase-functions/params';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { Role, hasRole } from './auth.utility';
import { getAuth } from 'firebase-admin/auth';

/**
 * Allowed origins for CORS - configured via Firebase environment.
 * Set via .env files (.env.prod for production, .env.dev for development).
 * The .env file must be present - no default to ensure explicit configuration.
 */
const ALLOWED_ORIGINS = defineString('ALLOWED_ORIGINS');

/**
 * CORS middleware - handles preflight and validates origins
 */
const corsMiddleware = (req: Request, res: Response, next: () => void) => {
  const origin = req.headers.origin;

  // Allow requests without origin (e.g., server-to-server)
  if (!origin) {
    next();
    return;
  }

  const allowedOrigins = ALLOWED_ORIGINS.value()
    .split(',')
    .map((o) => o.trim());

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, OPTIONS, PUT, PATCH, DELETE'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    next();
  } else {
    res.status(403).json({
      error: 'Forbidden: Origin not allowed by CORS policy',
      origin,
    });
  }
};

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
 * Verify Firebase Auth token from Authorization header
 */
async function verifyAuthToken(
  req: Request
): Promise<{ uid: string; email?: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Fluent function builder for creating Firebase HTTP functions
 *
 * Supports chaining secrets, strings, and role requirements.
 *
 * @example
 * // Simple function without secrets
 * export const getArtists = Functions.endpoint
 *   .requiringRole(Role.Admin)
 *   .handle<GetArtistsRequest, GetArtistsResponse>(async (data, context) => {
 *     const artists = await ArtistRepository.findAll();
 *     return { artists };
 *   });
 *
 * @example
 * // Function with Square secrets
 * export const createProduct = Functions.endpoint
 *   .usingSecrets(...SQUARE_SECRET_NAMES)
 *   .usingStrings(...SQUARE_STRING_NAMES)
 *   .requiringRole(Role.Admin)
 *   .handle<CreateProductRequest, CreateProductResponse>(
 *     async (data, context, secrets, strings) => {
 *       const square = new Square(secrets, strings);
 *       // ... use square client
 *     }
 *   );
 */
class FunctionBuilder<
  SecretNames extends string = never,
  StringNames extends string = never,
> {
  constructor(
    private readonly secrets: Record<SecretNames, SecretParam> = {} as Record<
      SecretNames,
      SecretParam
    >,
    private readonly strings: Record<StringNames, StringParam> = {} as Record<
      StringNames,
      StringParam
    >,
    private readonly options: FunctionOptions = {}
  ) {}

  /**
   * Add secrets to the function
   */
  usingSecrets<NewSecretNames extends string>(
    ...secretNames: NewSecretNames[]
  ): FunctionBuilder<SecretNames | NewSecretNames, StringNames> {
    const newSecrets = secretNames.reduce(
      (acc, name) => {
        acc[name as NewSecretNames] = defineSecret(name);
        return acc;
      },
      {} as Record<NewSecretNames, SecretParam>
    );

    return new FunctionBuilder(
      { ...this.secrets, ...newSecrets } as Record<
        SecretNames | NewSecretNames,
        SecretParam
      >,
      this.strings,
      this.options
    );
  }

  /**
   * Add string parameters to the function
   */
  usingStrings<NewStringNames extends string>(
    ...stringNames: NewStringNames[]
  ): FunctionBuilder<SecretNames, StringNames | NewStringNames> {
    const newStrings = stringNames.reduce(
      (acc, name) => {
        acc[name as NewStringNames] = defineString(name);
        return acc;
      },
      {} as Record<NewStringNames, StringParam>
    );

    return new FunctionBuilder(
      this.secrets,
      { ...this.strings, ...newStrings } as Record<
        StringNames | NewStringNames,
        StringParam
      >,
      this.options
    );
  }

  /**
   * Require authentication
   */
  requiringAuth(): FunctionBuilder<SecretNames, StringNames> {
    return new FunctionBuilder(this.secrets, this.strings, {
      ...this.options,
      requireAuth: true,
    });
  }

  /**
   * Require a specific role
   */
  requiringRole(role: Role): FunctionBuilder<SecretNames, StringNames> {
    return new FunctionBuilder(this.secrets, this.strings, {
      ...this.options,
      requiredRole: role,
    });
  }

  /**
   * Create the function with a handler
   *
   * @param handler - Function that receives request data, context, secrets, and strings
   */
  handle<TRequest, TResponse>(
    handler: (
      data: TRequest,
      context: FunctionContext,
      secrets: Record<SecretNames, string>,
      strings: Record<StringNames, string>
    ) => Promise<TResponse>
  ) {
    const secretParams = Object.values(this.secrets) as SecretParam[];

    return onRequest(
      {
        region: 'us-east4',
        invoker: 'public',
        secrets: secretParams,
      },
      async (req: Request, res: Response) => {
        // Handle CORS
        corsMiddleware(req, res, async () => {
          try {
            // Verify auth token if present
            const auth = await verifyAuthToken(req);
            const context: FunctionContext = {
              uid: auth?.uid,
              email: auth?.email,
            };

            // Check authentication if required
            if (this.options.requireAuth || this.options.requiredRole) {
              if (!auth?.uid) {
                res.status(401).json({
                  error:
                    'Unauthorized: You must be logged in to perform this action',
                });
                return;
              }
            }

            // Check role if required
            if (this.options.requiredRole) {
              const userHasRole = await hasRole(
                auth!.uid,
                this.options.requiredRole
              );
              if (!userHasRole) {
                res.status(403).json({
                  error: `Forbidden: You must be a ${this.options.requiredRole} to perform this action`,
                });
                return;
              }
            }

            // Extract secret values
            const secretValues = Object.fromEntries(
              Object.entries(this.secrets).map(([key, secret]) => [
                key,
                (secret as SecretParam).value(),
              ])
            ) as Record<SecretNames, string>;

            // Extract string values
            const stringValues = Object.fromEntries(
              Object.entries(this.strings).map(([key, str]) => [
                key,
                (str as StringParam).value(),
              ])
            ) as Record<StringNames, string>;

            // Parse request data from body
            const data = (req.body?.data ?? req.body ?? {}) as TRequest;

            // Execute handler
            const result = await handler(
              data,
              context,
              secretValues,
              stringValues
            );

            // Send response in the format expected by httpsCallable
            res.status(200).json({ data: result });
          } catch (error) {
            console.error('Function error:', error);
            res.status(500).json({
              error:
                error instanceof Error
                  ? error.message
                  : 'An unexpected error occurred',
            });
          }
        });
      }
    );
  }
}

/**
 * Functions factory for creating HTTP functions
 *
 * @example
 * export const myFunction = Functions.endpoint
 *   .requiringRole(Role.Admin)
 *   .handle(async (data, context) => {
 *     return { success: true };
 *   });
 */
export class Functions {
  static endpoint = new FunctionBuilder();
}

// ============================================================================
// Legacy API (for backwards compatibility)
// ============================================================================

/**
 * Create a Firebase HTTP function with CORS and auth handling
 *
 * @deprecated Use Functions.endpoint.handle() instead
 */
export function createFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>,
  options: FunctionOptions = {}
) {
  let builder = Functions.endpoint;

  if (options.requireAuth) {
    builder = builder.requiringAuth();
  }

  if (options.requiredRole) {
    builder = builder.requiringRole(options.requiredRole);
  }

  return builder.handle<TRequest, TResponse>(async (data, context) => {
    return handler(data, context);
  });
}

/**
 * Create a public function (no authentication required)
 * @deprecated Use Functions.endpoint.handle() instead
 */
export function createPublicFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, {});
}

/**
 * Create an authenticated function (requires login)
 * @deprecated Use Functions.endpoint.requiringAuth().handle() instead
 */
export function createAuthenticatedFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, { requireAuth: true });
}

/**
 * Create an admin-only function
 * @deprecated Use Functions.endpoint.requiringRole(Role.Admin).handle() instead
 */
export function createAdminFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, { requiredRole: Role.Admin });
}
