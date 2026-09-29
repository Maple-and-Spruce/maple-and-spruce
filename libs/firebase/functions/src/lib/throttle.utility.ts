/**
 * Request throttling for `Functions.endpoint` (ADR-034).
 *
 * Declared per endpoint with `.throttling(scope, rules)`. Each rule derives a
 * key from the request (the client IP, an email field, a session token) and
 * allows `limit` requests per fixed window of `windowSeconds`. Keys are
 * SHA-256 hashed before they reach Firestore, so the counters hold no emails or
 * addresses.
 *
 * Counters live in Firestore rather than memory so they survive cold starts
 * and deploys, and stay correct if an endpoint is ever given more than one
 * instance.
 *
 * **Fails open.** If the counter store errors, the request runs: throttling is
 * a limit on volume, and a Firestore blip must not turn into families unable to
 * register.
 */
import { createHash } from 'node:crypto';
import { RequestThrottleRepository } from '@maple/firebase/database';

/** What a rule can key on besides the request body. */
export interface ThrottleContext {
  /** Client IP as seen by Google's front end (see `extractTrustedClientIp`). */
  clientIp?: string;
}

export interface ThrottleRule {
  /** Stable name; part of the counter id, so renaming it resets the count. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
  /** The value to count against. `undefined` or empty skips this rule. */
  key: (data: unknown, context: ThrottleContext) => string | undefined;
}

export interface ThrottleDecision {
  allowed: boolean;
  /** The rule that refused the request, when one did. */
  rule?: string;
}

export type ThrottleHitFn = (
  bucketId: string,
  limit: number,
  windowSeconds: number
) => Promise<{ allowed: boolean; count: number }>;

export function hashThrottleKey(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

/**
 * Count this request against every rule and decide whether it may run.
 *
 * Every applicable rule is counted, even after one refuses, so a caller over
 * one limit cannot use the refusal to avoid being counted on the others.
 */
export async function checkThrottles(
  scope: string,
  rules: readonly ThrottleRule[],
  data: unknown,
  context: ThrottleContext,
  hit: ThrottleHitFn = RequestThrottleRepository.hit
): Promise<ThrottleDecision> {
  let refusedBy: string | undefined;

  for (const rule of rules) {
    const raw = rule.key(data, context);
    if (!raw || !raw.trim()) continue;

    const bucketId = `${scope}:${rule.name}:${hashThrottleKey(raw)}`;
    try {
      const outcome = await hit(bucketId, rule.limit, rule.windowSeconds);
      if (!outcome.allowed && !refusedBy) refusedBy = rule.name;
    } catch (error) {
      console.error(
        `[throttle] ${scope}:${rule.name} counter unavailable`,
        error
      );
    }
  }

  return refusedBy ? { allowed: false, rule: refusedBy } : { allowed: true };
}

function fieldValue(data: unknown, field: string): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

/** Rule builders, so endpoints declare *what* to count, not how. */
export const Throttle = {
  perClientIp(limit: number, windowSeconds: number): ThrottleRule {
    return {
      name: 'ip',
      limit,
      windowSeconds,
      key: (_data, context) => context.clientIp,
    };
  },

  /** Count per value of a request field, e.g. `email` or `sessionToken`. */
  perField(field: string, limit: number, windowSeconds: number): ThrottleRule {
    return {
      name: field,
      limit,
      windowSeconds,
      key: (data) => fieldValue(data, field),
    };
  },
};

const HOUR = 60 * 60;

/**
 * Limits for the public callables. Deliberately generous: a family retrying a
 * declined card, or asking for a link twice, must never reach them.
 */
export const THROTTLE_LIMITS = {
  /** Endpoints that take a card. */
  payment: {
    perIp: { limit: 20, windowSeconds: HOUR },
    perAccount: { limit: 8, windowSeconds: HOUR },
  },
  /** Endpoints that send an email. */
  emailLink: {
    perIp: { limit: 10, windowSeconds: HOUR },
    perAccount: { limit: 3, windowSeconds: HOUR },
  },
  /** Discount code lookups. */
  codeLookup: {
    perIp: { limit: 30, windowSeconds: 10 * 60 },
  },
} as const;

/** Per-IP + per-account rules for a card-taking endpoint. */
export function paymentThrottles(accountField: string): ThrottleRule[] {
  const { perIp, perAccount } = THROTTLE_LIMITS.payment;
  return [
    Throttle.perClientIp(perIp.limit, perIp.windowSeconds),
    Throttle.perField(accountField, perAccount.limit, perAccount.windowSeconds),
  ];
}

/** Per-IP + per-address rules for an endpoint that sends an email. */
export function emailLinkThrottles(emailField = 'email'): ThrottleRule[] {
  const { perIp, perAccount } = THROTTLE_LIMITS.emailLink;
  return [
    Throttle.perClientIp(perIp.limit, perIp.windowSeconds),
    Throttle.perField(emailField, perAccount.limit, perAccount.windowSeconds),
  ];
}

/** Per-IP rule for code lookups. */
export function codeLookupThrottles(): ThrottleRule[] {
  const { perIp } = THROTTLE_LIMITS.codeLookup;
  return [Throttle.perClientIp(perIp.limit, perIp.windowSeconds)];
}
