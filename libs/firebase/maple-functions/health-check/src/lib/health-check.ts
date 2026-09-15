/**
 * healthCheck — a public liveness probe. Also served at `/healthCheck` via a
 * hosting rewrite (`firebase.json`), and the thing the utility integration
 * suite pokes to prove the function builder's plumbing works end to end.
 *
 * It used to be declared inline in `apps/functions/src/index.ts`, which meant
 * no deploy filter could ever name it: CI builds `--only functions:<codebase>:<name>`
 * from the **library directory name**, and an export with no library behind it
 * is invisible to that. Giving it a library is what makes it deployable at all
 * (#872).
 */
import { createPublicFunction } from '@maple/firebase/functions';

export const healthCheck = createPublicFunction<
  Record<string, never>,
  { status: string; timestamp: string }
>(async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
});
