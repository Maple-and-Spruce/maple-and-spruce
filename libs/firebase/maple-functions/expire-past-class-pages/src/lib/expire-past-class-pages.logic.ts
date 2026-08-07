/**
 * Pure selection logic for the past-class page sweep.
 *
 * Deliberately kept in its own module with NO barrel imports (no
 * `@maple/firebase/webflow`, `@maple/firebase/database`, or
 * `@maple/firebase/functions`). The spec imports only this file, so the
 * coverage report loads a couple of files instead of the ~124 that the
 * repository/validation layers drag in through those barrels. See
 * `docs/reference/code-standards.md` and the ADR-027 notes on the coverage
 * barrel cascade — the same trap previously cost ~15% global coverage.
 */
import type { Class, ClassSession } from '@maple/ts/domain';

/**
 * Return sessions sorted earliest-first without mutating the input.
 *
 * Reimplemented here rather than importing `getSortedSessions` so this module
 * stays free of the `@maple/ts/domain` barrel. `dateTime` is typed as `Date`
 * but arrives from Firestore as a Timestamp-or-string in some paths, so
 * normalize defensively.
 */
function toTime(session: ClassSession): number {
  const value = session.dateTime as unknown;
  if (value instanceof Date) return value.getTime();
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = new Date(value as string | number).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * A class is expired once its LAST session has finished — a multi-week Studio
 * Series stays live through its final meeting, not just its first.
 *
 * Uses session END (start + duration) so a class currently in progress is not
 * pulled down mid-lesson.
 *
 * Classes with no sessions are never expired here; they are drafts that the
 * regular sync already keeps out of Webflow.
 */
export function isClassPast(classEntity: Class, now: Date): boolean {
  if (classEntity.sessions.length === 0) return false;

  const lastStart = Math.max(...classEntity.sessions.map(toTime));
  const endsAt = lastStart + classEntity.durationMinutes * 60 * 1000;

  return endsAt < now.getTime();
}

/**
 * Intersect the classes Firestore knows are in the past with the items Webflow
 * reports as actually live, and return the Webflow item IDs to unpublish.
 *
 * Driving the "is it live?" half off Webflow rather than a Firestore flag makes
 * the sweep idempotent for free: once an item is unpublished it stops appearing
 * in `listItemsLive`, so the next run skips it with no bookkeeping field to
 * keep in sync.
 */
export function findExpiredLiveClasses(
  classes: Class[],
  liveItemIdsByFirebaseId: Map<string, string>,
  now: Date
): { classId: string; name: string; webflowItemId: string }[] {
  const expired: { classId: string; name: string; webflowItemId: string }[] =
    [];

  for (const classEntity of classes) {
    if (!isClassPast(classEntity, now)) continue;

    const webflowItemId = liveItemIdsByFirebaseId.get(classEntity.id);
    if (!webflowItemId) continue;

    expired.push({
      classId: classEntity.id,
      name: classEntity.name,
      webflowItemId,
    });
  }

  return expired;
}
