/**
 * "Did this write lose to a document that is already there?" (#117)
 *
 * Several repositories key a document on something deterministic and write it
 * with `create()`, so that a collision *is the steady state* rather than an
 * error: re-running the billing planner, re-materialising a standing schedule,
 * a Tally lead delivered twice, a trigger fired twice. Every one of them wants
 * the same answer, and every one of them had its own guard.
 *
 * Those guards matched the **gRPC** status code and nothing else, which is a
 * trap: the admin SDK falls back to REST, and over REST the same collision
 * arrives as a `409` whose body carries `"status": "ALREADY_EXISTS"` and whose
 * `code` is therefore not `6`. The guard misses, the throw escapes, and because
 * these writes sit inside all-or-nothing loops it takes everything else down
 * with it — the whole billing run in #100, every standing arrangement in #117.
 *
 * It is invisible in tests, too: the emulator speaks gRPC, so a suite can be
 * green on the one transport that was never broken.
 *
 * So: one function, both transports, and the message as a last resort for a
 * shape neither of them predicted.
 */

/** Firestore's gRPC status for a `create()` onto an existing id. */
const GRPC_ALREADY_EXISTS = 6;
/** The same outcome when the admin SDK is talking REST. */
const HTTP_CONFLICT = 409;
/** …and what the client SDKs call it. */
const CLIENT_CODE = 'already-exists';

export function isAlreadyExists(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (
    code === GRPC_ALREADY_EXISTS ||
    code === HTTP_CONFLICT ||
    code === CLIENT_CODE
  ) {
    return true;
  }
  if ((err as { status?: unknown }).status === 'ALREADY_EXISTS') return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('ALREADY_EXISTS');
}
