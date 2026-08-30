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
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
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
import { getApps, initializeApp } from 'firebase-admin/app';

/**
 * Context provided to function handlers
 */
export interface FunctionContext {
  /** The authenticated user's UID, if any */
  uid?: string;
  /** The authenticated user's email, if any */
  email?: string;
  /**
   * The caller's IP address, when Express could determine one.
   *
   * Only used for ad-attribution signal (Meta CAPI wants
   * `client_ip_address` + `client_user_agent` for probabilistic matching).
   * Never authorize on this — it's trivially spoofable behind a proxy.
   */
  ip?: string;
  /** The caller's `User-Agent` header, if sent. */
  userAgent?: string;
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
  /**
   * Maximum instances this function may scale to. Overrides the global
   * default set in `global-runtime-options.ts` (GLOBAL_MAX_INSTANCES).
   * Only set this for a function that genuinely needs more fan-out than
   * the portal-wide default.
   */
  maxInstances?: number;
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
  options: Pick<FunctionOptions, 'validator' | 'uniquenessChecks'>,
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
      throwAlreadyExists(check.entity ?? 'Record', check.field, String(value));
    }
  }
}

/**
 * Lazily initialize Firebase Admin SDK
 * Called only when needed, not at module load time
 */
function ensureAdminInitialized(): void {
  if (getApps().length === 0) {
    initializeApp();
  }
}

/**
 * Verify Firebase Auth token from Authorization header
 */
async function verifyAuthToken(
  req: Request,
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
  isEmulator: boolean,
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
        'GET, POST, OPTIONS, PUT, PATCH, DELETE',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization,Content-Type',
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
 * Best-effort client IP for ad-attribution signal only.
 *
 * Cloud Run sits behind Google's front end, so `req.ip` is the proxy unless
 * Express trusts the forwarding chain. `x-forwarded-for` is a comma-separated
 * list where the left-most entry is the original client.
 */
function extractClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(',')[0]?.trim();
  if (first) return first;
  return typeof req.ip === 'string' && req.ip ? req.ip : undefined;
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
/**
 * A single route on a router function: everything `handle()` would have baked
 * into its own Cloud Function, minus the `onRequest` wrapper.
 */
export interface RouteDescriptor {
  options: FunctionOptions;
  secrets: Record<string, SecretParam>;
  strings: Record<string, StringParam>;
  handler: (
    data: never,
    context: FunctionContext,
    secrets: Record<string, string>,
    strings: Record<string, string>,
  ) => Promise<unknown>;
}

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
    private readonly options: FunctionOptions = {},
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
      {} as Record<NewSecretNames, SecretParam>,
    );

    return new FunctionBuilder(
      { ...this.secrets, ...newSecrets } as Record<
        SecretNames | NewSecretNames,
        SecretParam
      >,
      this.strings,
      this.options,
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
      {} as Record<NewStringNames, StringParam>,
    );

    return new FunctionBuilder(
      this.secrets,
      { ...this.strings, ...newStrings } as Record<
        StringNames | NewStringNames,
        StringParam
      >,
      this.options,
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
    role: Role | readonly Role[],
  ): FunctionBuilder<SecretNames, StringNames> {
    return new FunctionBuilder(this.secrets, this.strings, {
      ...this.options,
      requiredRole: role,
    });
  }

  /**
   * Set runtime options (memory, concurrency, minInstances, timeoutSeconds)
   */
  withOptions(
    runtime: RuntimeOptions,
  ): FunctionBuilder<SecretNames, StringNames> {
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
    validator: ValidatorFn,
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
    check: UniquenessCheck<T>,
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
   * Build this endpoint as a ROUTE on a router function instead of its own
   * Cloud Function (ADR-029).
   *
   * Identical chain semantics to `handle()` — `requiringRole`, `validating`,
   * `ensuringUnique`, `withSecrets` all apply per-route — it just returns a
   * descriptor for `Functions.router()` rather than calling `onRequest`.
   * Per-route options are what lets a router mix auth levels: the discounts
   * router carries four admin routes plus the public `lookupDiscount`.
   */
  asRoute<TRequest, TResponse>(
    handler: (
      data: TRequest,
      context: FunctionContext,
      secrets: Record<SecretNames, string>,
      strings: Record<StringNames, string>,
    ) => Promise<TResponse>,
  ): RouteDescriptor {
    return {
      options: this.options,
      secrets: this.secrets as Record<string, SecretParam>,
      strings: this.strings as Record<string, StringParam>,
      handler: handler as never,
    };
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
      strings: Record<StringNames, string>,
    ) => Promise<TResponse>,
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
        ...(this.options.runtime?.memory && {
          memory: this.options.runtime.memory,
        }),
        ...(this.options.runtime?.concurrency && {
          concurrency: this.options.runtime.concurrency,
        }),
        ...(this.options.runtime?.minInstances !== undefined && {
          minInstances: this.options.runtime.minInstances,
        }),
        ...(this.options.runtime?.maxInstances !== undefined && {
          maxInstances: this.options.runtime.maxInstances,
        }),
        ...(this.options.runtime?.timeoutSeconds && {
          timeoutSeconds: this.options.runtime.timeoutSeconds,
        }),
      },
      async (req: Request, res: Response) => {
        // CORS first: preflight must be answered before auth or routing.
        corsMiddleware(req, res, async () => {
          await runEndpointPipeline<TRequest, TResponse>({
            req,
            res,
            options: this.options,
            secrets: this.secrets as Record<string, SecretParam>,
            strings: this.strings as Record<string, StringParam>,
            handler: handler as never,
          });
        });
      },
    );
  }
}

/**
 * The per-request pipeline shared by `Functions.endpoint` (one function per
 * endpoint) and `Functions.router` (many routes on one function).
 *
 * Extracted so the two cannot drift: warmup short-circuit, auth, role gate,
 * secret/string resolution, validation, the `{ data: … }` callable envelope,
 * and the error->status mapping all live HERE and nowhere else. ADR-029
 * consolidates endpoints into routers precisely because the deploy write
 * quota scales with function count; that is only safe if a route behaves
 * byte-for-byte like the standalone function it replaced.
 *
 * CORS runs OUTSIDE this (in the onRequest wrapper) because it must answer
 * preflight before any routing or auth work happens.
 */
export async function runEndpointPipeline<TRequest, TResponse>(args: {
  req: Request;
  res: Response;
  options: FunctionOptions;
  secrets: Record<string, SecretParam>;
  strings: Record<string, StringParam>;
  handler: (
    data: TRequest,
    context: FunctionContext,
    secrets: Record<string, string>,
    strings: Record<string, string>,
  ) => Promise<TResponse>;
  /** Route name for logs; undefined for a single-endpoint function. */
  routeLabel?: string;
}): Promise<void> {
  const { req, res, options, secrets, strings, handler, routeLabel } = args;
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
      ip: extractClientIp(req),
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : undefined,
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

    // Check role if required (any-of when an array is given)
    if (options.requiredRole) {
      const requiredRoles: readonly Role[] = Array.isArray(options.requiredRole)
        ? options.requiredRole
        : [options.requiredRole as Role];
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
      Object.entries(secrets).map(([key, secret]) => [
        key,
        (secret as SecretParam).value(),
      ]),
    ) as Record<string, string>;

    // Extract string values (only accessed at runtime, not at cold start)
    const stringValues = Object.fromEntries(
      Object.entries(strings).map(([key, str]) => [
        key,
        (str as StringParam).value(),
      ]),
    ) as Record<string, string>;

    // Parse request data from body
    const data = (req.body?.data ?? req.body ?? {}) as TRequest;

    // Run validator + uniqueness checks (no-op when neither is set)
    await runChecks(data, options);

    // Execute handler
    const result = await handler(data, context, secretValues, stringValues);

    // Send response in the format expected by httpsCallable
    res.status(200).json({ data: result });
  } catch (error) {
    console.error(
      routeLabel ? `Function error [${routeLabel}]:` : 'Function error:',
      error,
    );

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    // Resource-ownership failures (throwPermissionDenied) map to 403 so
    // clients can tell "not allowed" from "bad input" — this mirrors the
    // role-gate's 403. Everything else keeps the existing 400
    // INVALID_ARGUMENT contract.
    if (error instanceof HttpsError && error.code === 'permission-denied') {
      res.status(403).json({
        error: { message, status: 'PERMISSION_DENIED' },
      });
      return;
    }

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
}

/**
 * Build ONE Cloud Function that serves many routes (ADR-029).
 *
 * Why this exists: every function library is a separate Cloud Run service, and
 * the gen-2 deploy write quota is 60 per 60 seconds and CANNOT be raised. At
 * 215 functions a full deploy needs >=4 minutes of pure API writes and has been
 * breaching the regional CPU rate. Routers collapse a domain's endpoints onto
 * one service without changing how any single endpoint behaves.
 *
 * Routes dispatch on the URL path, so `httpsCallableFromURL(fn, base + '/getDiscounts')`
 * reaches the `getDiscounts` route. Each route keeps its OWN auth/role/
 * validation chain via `asRoute()`, and every route runs the exact same
 * `runEndpointPipeline` a standalone function would have run.
 *
 * @example
 * export const discountsApi = createRouter({
 *   lookupDiscount: Functions.endpoint.asRoute(lookupDiscountHandler),
 *   getDiscounts: Functions.endpoint.requiringRole(Role.Admin).asRoute(getDiscountsHandler),
 * });
 */
export function createRouter(
  routes: Record<string, RouteDescriptor>,
  runtime?: RuntimeOptions,
) {
  const allowedOriginsParam = defineString('ALLOWED_ORIGINS');
  const corsMiddleware = createCorsMiddleware(allowedOriginsParam);

  // A function declares its secrets up front, so the router needs the union of
  // every route's secrets. Each route still only receives its own at runtime.
  const secretParams = Array.from(
    new Set(Object.values(routes).flatMap((r) => Object.values(r.secrets))),
  ) as SecretParam[];

  return onRequest(
    {
      region: 'us-east4',
      invoker: 'public',
      secrets: secretParams,
      ...(runtime?.memory && { memory: runtime.memory }),
      ...(runtime?.concurrency && { concurrency: runtime.concurrency }),
      ...(runtime?.minInstances !== undefined && {
        minInstances: runtime.minInstances,
      }),
      ...(runtime?.maxInstances !== undefined && {
        maxInstances: runtime.maxInstances,
      }),
      ...(runtime?.timeoutSeconds && {
        timeoutSeconds: runtime.timeoutSeconds,
      }),
    },
    async (req: Request, res: Response) => {
      // CORS first: preflight must be answered before routing or auth.
      corsMiddleware(req, res, async () => {
        const routeName = (req.path ?? '').split('/').filter(Boolean)[0];

        // Warmup must work WITHOUT a route (clients warm the function, not an
        // endpoint) and must not require auth — same contract as `handle()`.
        const rawBody = (req.body?.data ?? req.body ?? {}) as {
          __warmup?: unknown;
        };
        if (rawBody && rawBody.__warmup === true) {
          res.status(200).json({ data: { warm: true } });
          return;
        }

        const route = routeName ? routes[routeName] : undefined;
        if (!route) {
          // Callable-protocol error envelope so httpsCallable surfaces a real
          // message instead of a generic "internal".
          res.status(404).json({
            error: {
              message: `Unknown route: ${routeName || '(none)'}`,
              status: 'NOT_FOUND',
            },
          });
          return;
        }

        await runEndpointPipeline({
          req,
          res,
          options: route.options,
          secrets: route.secrets,
          strings: route.strings,
          handler: route.handler,
          routeLabel: routeName,
        });
      });
    },
  );
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
  /** Build one function serving many routes — see createRouter (ADR-029). */
  static router = createRouter;
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
  options: FunctionOptions = {},
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
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>,
) {
  return createFunction(handler, {});
}

/**
 * Create an authenticated function (requires login)
 * @deprecated Use Functions.endpoint.requiringAuth().handle() instead
 */
export function createAuthenticatedFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>,
) {
  return createFunction(handler, { requireAuth: true });
}

/**
 * Create an admin-only function
 * @deprecated Use Functions.endpoint.requiringRole(Role.Admin).handle() instead
 */
export function createAdminFunction<TRequest, TResponse>(
  handler: (data: TRequest, context: FunctionContext) => Promise<TResponse>,
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
  roles: readonly Role[],
) {
  return createFunction(handler, { requiredRole: roles });
}
