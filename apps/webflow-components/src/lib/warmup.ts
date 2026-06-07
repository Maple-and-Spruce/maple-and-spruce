import { httpsCallable, type Functions } from 'firebase/functions';

/**
 * Pre-warm one or more callable Cloud Functions by sending a sentinel
 * request that boots the container without running auth, validation,
 * or the handler.
 *
 * Fire and forget on widget mount for downstream functions the user
 * is about to invoke. By the time they act, the instance is warm.
 *
 * Server-side support lives in `Functions.endpoint.handle()` — every
 * function built through the shared builder gets warmup support for
 * free; no per-function opt-in needed.
 *
 * @example
 *   warmup(functions, 'calculateRegistrationCost', 'createRegistration');
 */
export function warmup(
  functions: Functions,
  ...functionNames: string[]
): Promise<void> {
  // Wrapping each iteration in async/try-catch (not .catch()) catches BOTH
  // sync throws from httpsCallable() / its returned callable AND async
  // rejections. A bare .catch() would let a synchronous throw escape and
  // break the widget mount effect that fired the warmup.
  return Promise.all(
    functionNames.map(async (name) => {
      try {
        await httpsCallable(functions, name)({ __warmup: true });
      } catch {
        // best-effort
      }
    })
  ).then(() => undefined);
}
