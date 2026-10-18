/**
 * A stateless Vest suite: every call validates its own input and nothing else.
 *
 * Vest 5 shipped this as `staticSuite`. Vest 6 removed it in favour of
 * `create(cb).runStatic(...)`, but `runStatic` is not actually isolated: a
 * focused run (`only(field)`) carries over results for unfocused fields from
 * whatever ran before it. After a full run that failed `email`, a later
 * `validate(data, 'classId')` still reports the old `email` error.
 *
 * That breaks two things here:
 * - the partial-update pattern in Cloud Functions, which validates only the
 *   fields a request changes; and
 * - warm function containers, where one request's errors would leak into the
 *   next request's result.
 *
 * Building a fresh suite per call is fully isolated, which is what
 * `staticSuite` did in Vest 5. `static-suite.spec.ts` pins the behaviour.
 */
import { create } from 'vest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors Vest's own CB type
export function staticSuite<T extends (...args: any[]) => void>(callback: T) {
  return (...args: Parameters<T>) => create(callback).run(...args);
}
