/**
 * Firebase Cloud Functions utilities
 *
 * Provides a consistent pattern for creating HTTP functions with
 * CORS handling, authentication, and authorization.
 *
 * Uses onRequest (HTTP functions) with manual CORS middleware for full
 * control over CORS headers and preflight handling.
 *
 * Pattern adapted from Mountain Sol Platform:
 * @see https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/functions.utility.ts
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { Role, hasRole } from './auth.utility';
import { getAuth } from 'firebase-admin/auth';

/**
 * Allowed origins for CORS - configured via Firebase environment.
 * Set via .env files (.env.prod for production, .env.dev for development).
 * Production should NOT include localhost for security.
 */
const ALLOWED_ORIGINS = defineString('ALLOWED_ORIGINS', {
  default: 'https://www.mapleandsprucefolkarts.com,https://mapleandsprucefolkarts.com,https://www.mapleandsprucewv.com,https://mapleandsprucewv.com,https://maple-and-spruce-maple-spruce.vercel.app',
});

/**
 * CORS middleware - handles preflight and validates origins
 */
const corsMiddleware = (
  req: Request,
  res: Response,
  next: () => void
) => {
  const origin = req.headers.origin;

  // Allow requests without origin (e.g., server-to-server)
  if (!origin) {
    next();
    return;
  }

  const allowedOrigins = ALLOWED_ORIGINS.value().split(',').map((o) => o.trim());

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
async function verifyAuthToken(req: Request): Promise<{ uid: string; email?: string } | null> {
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
 * Create a Firebase HTTP function with CORS and auth handling
 *
 * @param handler - The function implementation
 * @param options - Authentication and authorization options
 * @returns A Firebase HTTP function
 *
 * @example
 * export const getArtists = createFunction<GetArtistsRequest, GetArtistsResponse>(
 *   async (data, context) => {
 *     const artists = await ArtistRepository.findAll();
 *     return { artists };
 *   },
 *   { requireAuth: true }
 * );
 */
export function createFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>,
  options: FunctionOptions = {}
) {
  return onRequest(
    {
      region: 'us-east4',
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
          if (options.requireAuth || options.requiredRole) {
            if (!auth?.uid) {
              res.status(401).json({
                error: 'Unauthorized: You must be logged in to perform this action',
              });
              return;
            }
          }

          // Check role if required
          if (options.requiredRole) {
            const userHasRole = await hasRole(auth!.uid, options.requiredRole);
            if (!userHasRole) {
              res.status(403).json({
                error: `Forbidden: You must be a ${options.requiredRole} to perform this action`,
              });
              return;
            }
          }

          // Parse request data from body
          const data = (req.body?.data ?? req.body ?? {}) as TRequest;

          // Execute handler
          const result = await handler(data, context);

          // Send response in the format expected by httpsCallable
          res.status(200).json({ data: result });
        } catch (error) {
          console.error('Function error:', error);
          res.status(500).json({
            error: error instanceof Error ? error.message : 'An unexpected error occurred',
          });
        }
      });
    }
  );
}

/**
 * Create a public function (no authentication required)
 */
export function createPublicFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, {});
}

/**
 * Create an authenticated function (requires login)
 */
export function createAuthenticatedFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, { requireAuth: true });
}

/**
 * Create an admin-only function
 */
export function createAdminFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>
) {
  return createFunction(handler, { requiredRole: Role.Admin });
}
