/**
 * Firebase Cloud Functions utilities
 *
 * Provides a consistent pattern for creating HTTP functions with
 * CORS handling, authentication, authorization, and secrets management.
 *
 * IMPORTANT: This module is designed to avoid cold start delays.
 * - NO module-level defineSecret/defineString calls
 * - NO module-level Firebase Admin initialization
 * - Secrets and strings are defined lazily inside builder methods
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
import { Role, hasAnyRole } from './auth.utility';
import { throwAlreadyExists, throwValidationError } from './errors.utility';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';

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
 * Runtime options for Cloud Functions (2nd gen)
 */
export interface RuntimeOptions {
  /** Memory allocation (default: 256MiB) */
  memory?: '128MiB' | '256MiB' | '512MiB' | '1GiB' | '2GiB';
  /** Concurrent requests per instance (default: 1, max: 1000). Requires >= 1 CPU. */
  concurrency?: number;
  /** Minimum warm instances to avoid cold starts (default: 0) */
  minInstances?: number;
  /** Timeout in seconds (default: 60, max: 540) */
  timeoutSeconds?: number;
}

/**
 * Shape of a vest (or vest-like) suite result.
 *
 * Validators only need to expose `isValid()` and `getErrors()` — anything
 * that satisfies this shape works with `assertValid` and `.validating()`.
 */
export interface ValidationResultLike {
  isValid(): boolean;
  getErrors(): Record<string, string[]>;
}

/**
 * A function that validates request data and returns a vest-style result.
 *
 * The parameter is `any` so vest `staticSuite(...)` instances — which type
 * their data as `Partial<TInput>` — pass the structural check. The
 * runtime contract is just "returns something with isValid() and
 * getErrors()".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ValidatorFn = (data: any) => ValidationResultLike;

/**
 * Declarative uniqueness check for a request field.
 *
 * Used with `.ensuringUnique()` to declare "this value must not already
 * exist in storage" without writing imperative checks in every handler.
 *
 * The distributive mapped type lets TypeScript narrow the `exists`
 * parameter to the actual field's value type — so for
 * `{ field: 'email', ... }` on `CreateArtistRequest`, `exists` receives
 * a `string`, not the union of every property type.
 */
export type UniquenessCheck<T = Record<string, unknown>> = {
  [K in keyof T & string]: {
    /** Field on the request data to read for uniqueness */
    field: K;
    /** Returns true if a record with this value already exists */
    exists: (value: T[K]) => Promise<boolean>;
    /** Entity name used in the default error message ("Artist", "Instructor"...) */
    entity?: string;
    /** Optional predicate; the check is skipped when this returns false */
    when?: (data: T) => boolean;
  };
}[keyof T & string];

/**
 * Options for creating a function
 */
export interface FunctionOptions {
  /** Require user to be authenticated */
  requireAuth?: boolean;
  /** Require user to have a specific role (or ANY of an array of roles) */
  requiredRole?: Role | readonly Role[];
  /** Runtime configuration for the Cloud Function */
  runtime?: RuntimeOptions;
  /** Run this validator on the request data before invoking the handler */
  validator?: ValidatorFn;
  /** Run these uniqueness checks before invoking the handler */
  uniquenessChecks?: ReadonlyArray<UniquenessCheck>;
}

/**
 * Throw a validation error if the result is invalid.
 *
 * Useful when the validation needs custom orchestration (e.g. merging
 * existing data) that doesn't fit the declarative `.validating()` chain.
 *
 * @example
 * const existing = await ArtistRepository.findById(data.id);
 * if (!existing) throwNotFound('Artist', data.id);
 * assertValid(artistValidation({ ...existing, ...data }));
 */
export function assertValid(result: ValidationResultLike): void {
  if (!result.isValid()) {
    throwValidationError(result.getErrors());
  }
}

/**
 * Run validator + uniqueness checks against request data.
 *
 * Exported so the policy is testable in isolation, without spinning up
 * the Firebase Functions request machinery. The function builder calls
 * this from `handle()` after auth/role checks pass.
 */
export async function runChecks(
  data: unknown,
  options: Pick<FunctionOptions, 'validator' | 'uniquenessChecks'>
): Promise<void> {
  if (options.validator) {
    assertValid(options.validator(data));
  }
  for (const check of options.uniquenessChecks ?? []) {
    const typedData = data as Record<string, unknown>;
    if (check.when && !check.when(typedData as never)) continue;
    const value = typedData[check.field];
    if (value === undefined || value === null) continue;
    const exists = await check.exists(value as never);
    if (exists) {
      throwAlreadyExists(
        check.entity ?? 'Record',
        check.field,
        String(value)
      );
    }
  }
}

/**
 * Lazily initialize Firebase Admin SDK
 * Called only when needed, not at module load time
 */
function ensureAdminInitialized(): void {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
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
    ensureAdminInitialized();
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
 * CORS middleware - handles preflight and validates origins
 *
 * IMPORTANT: ALLOWED_ORIGINS is passed in as a parameter, not accessed
 * from module scope. This avoids cold start delays from defineString.
 */
/**
 * Decide whether a request Origin passes CORS.
 *
 * Beyond the configured allowlist, the Functions emulator additionally accepts
 * any localhost / 127.0.0.1 origin regardless of port: worktree-based local dev
 * and integration tests run the web app + emulators on offset ports
 * (EMULATOR_PORT_OFFSET), so the request Origin is http://localhost:{3000+offset}
 * — which the fixed ALLOWED_ORIGINS list can't enumerate. Guarded by
 * `isEmulator` so production CORS is unchanged.
 */
export function isOriginAllowed(
  origin: string,
  allowedOrigins: string[],
  isEmulator: boolean
): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (isEmulator) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  return false;
}

function createCorsMiddleware(allowedOriginsParam: StringParam) {
  return (req: Request, res: Response, next: () => void) => {
    const origin = req.headers.origin;

    // Allow requests without origin (e.g., server-to-server, health checks)
    if (!origin) {
      next();
      return;
    }

    const allowedOrigins = allowedOriginsParam
      .value()
      .split(',')
      .map((o) => o.trim());

    const isEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';

    if (isOriginAllowed(origin, allowedOrigins, isEmulator)) {
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
}

/**
 * Fluent function builder for creating Firebase HTTP functions
 *
 * Supports chaining secrets, strings, and role requirements.
 * All defineSecret/defineString calls happen inside builder methods,
 * avoiding cold start delays from module-level initialization.
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
   *
   * Secrets are defined lazily here, not at module level.
   * This avoids cold start delays from Secret Manager fetches.
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
   *
   * Strings are defined lazily here, not at module level.
   * This avoids cold start delays from parameter fetches.
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
   * Require a specific role, or ANY of an array of roles (any-of).
   *
   * @example
   * .requiringRole(Role.Admin)                    // admin only
   * .requiringRole([Role.Admin, Role.MtTeacher])  // admin OR MT teacher
   */
  requiringRole(
    role: Role | readonly Role[]
  ): FunctionBuilder<SecretNames, StringNames> {
    return new FunctionBuilder(this.secrets, this.strings, {
      ...this.options,
      requiredRole: role,
    });
  }

  /**
   * Set runtime options (memory, concurrency, minInstances, timeoutSeconds)
   */
  withOptions(runtime: RuntimeOptions): FunctionBuilder<SecretNames, StringNames> {
    return new FunctionBuilder(this.secrets, this.strings, {
      ...this.options,
      runtime,
    });
  }

  /**
   * Validate the request body before calling the handler.
   *
   * If `validator(data)` returns an invalid result, throws a 400 with
   * `Validation failed: <field>: <message>; ...`. The handler never runs.
   *
   * @example
   * Functions.endpoint
   *   .requiringRole(Role.Admin)
   *   .validating(artistValidation)
   *   .handle<CreateArtistRequest, CreateArtistResponse>(...)
   */
  validating(
    validator: ValidatorFn
  ): FunctionBuilder<SecretNames, StringNames> {
    return new FunctionBuilder(this.secrets, this.strings, {
      ...this.options,
      validator,
    });
  }

  /**
   * Assert a request field is unique before calling the handler.
   *
   * Chainable — call multiple times to assert several fields. Each check
   * runs sequentially after validation. The handler never runs if any
   * uniqueness check finds a conflict.
   *
   * @example
   * Functions.endpoint
   *   .requiringRole(Role.Admin)
   *   .validating(artistValidation)
   *   .ensuringUnique<CreateArtistRequest>({
   *     entity: 'Artist',
   *     field: 'email',
   *     exists: async (email) =>
   *       (await ArtistRepository.findByEmail(email)) !== undefined,
   *   })
   *   .handle<CreateArtistRequest, CreateArtistResponse>(...)
   */
  ensuringUnique<T = Record<string, unknown>>(
    check: UniquenessCheck<T>
  ): FunctionBuilder<SecretNames, StringNames> {
    return new FunctionBuilder(this.secrets, this.strings, {
      ...this.options,
      uniquenessChecks: [
        ...(this.options.uniquenessChecks ?? []),
        check as UniquenessCheck,
      ],
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
    // Define ALLOWED_ORIGINS lazily here, not at module level
    // This is the key optimization - defineString is called when handle() is invoked
    // during function registration, not when the module is first imported
    const allowedOriginsParam = defineString('ALLOWED_ORIGINS');

    const secretParams = Object.values(this.secrets) as SecretParam[];
    const corsMiddleware = createCorsMiddleware(allowedOriginsParam);

    return onRequest(
      {
        region: 'us-east4',
        invoker: 'public',
        secrets: secretParams,
        ...(this.options.runtime?.memory && { memory: this.options.runtime.memory }),
        ...(this.options.runtime?.concurrency && { concurrency: this.options.runtime.concurrency }),
        ...(this.options.runtime?.minInstances !== undefined && { minInstances: this.options.runtime.minInstances }),
        ...(this.options.runtime?.timeoutSeconds && { timeoutSeconds: this.options.runtime.timeoutSeconds }),
      },
      async (req: Request, res: Response) => {
        // Handle CORS
        corsMiddleware(req, res, async () => {
          try {
            // Warmup short-circuit. A request body of `{ __warmup: true }`
            // (sent as `{ data: { __warmup: true } }` by httpsCallable)
            // boots this function instance without running auth, validation,
            // or the handler. Lets clients pre-warm cold endpoints from the
            // UI in the background while the user is reading the page.
            const rawBody = (req.body?.data ?? req.body ?? {}) as {
              __warmup?: unknown;
            };
            if (rawBody && rawBody.__warmup === true) {
              res.status(200).json({ data: { warm: true } });
              return;
            }

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

            // Check role if required (any-of when an array is given)
            if (this.options.requiredRole) {
              const requiredRoles: readonly Role[] = Array.isArray(
                this.options.requiredRole
              )
                ? this.options.requiredRole
                : [this.options.requiredRole as Role];
              const userHasRole = await hasAnyRole(auth!.uid, requiredRoles);
              if (!userHasRole) {
                res.status(403).json({
                  error: `Forbidden: You must be a ${requiredRoles.join(' or ')} to perform this action`,
                });
                return;
              }
            }

            // Extract secret values (only accessed at runtime, not at cold start)
            const secretValues = Object.fromEntries(
              Object.entries(this.secrets).map(([key, secret]) => [
                key,
                (secret as SecretParam).value(),
              ])
            ) as Record<SecretNames, string>;

            // Extract string values (only accessed at runtime, not at cold start)
            const stringValues = Object.fromEntries(
              Object.entries(this.strings).map(([key, str]) => [
                key,
                (str as StringParam).value(),
              ])
            ) as Record<StringNames, string>;

            // Parse request data from body
            const data = (req.body?.data ?? req.body ?? {}) as TRequest;

            // Run validator + uniqueness checks (no-op when neither is set)
            await runChecks(data, this.options);

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

            const message =
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred';

            // Return error in the callable protocol format so httpsCallable
            // on the client can extract the message. Without this structure,
            // the Firebase SDK shows a generic "internal" error to users.
            res.status(400).json({
              error: {
                message,
                status: 'INVALID_ARGUMENT',
              },
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

/**
 * Create a function callable by ANY of the given roles (any-of).
 *
 * Legacy-style counterpart to createAdminFunction for the scoped-roles
 * matrix (epic #617) — lets a createAdminFunction/createAuthenticatedFunction
 * call site widen or tighten to a role set as a one-line change. For new
 * functions prefer Functions.endpoint.requiringRole([...]).handle().
 */
export function createRoleFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>,
  roles: readonly Role[]
) {
  return createFunction(handler, { requiredRole: roles });
}
