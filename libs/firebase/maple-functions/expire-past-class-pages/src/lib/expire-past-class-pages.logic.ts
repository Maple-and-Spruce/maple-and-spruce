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
 * A class is past once its LAST session has finished: a multi-week Studio
 * Series is current through its final meeting, not just its first.
 *
 * Uses session END (start + duration), so a class in progress is not past.
 *
 * Classes with no sessions are never past here; they are drafts that the
 * regular sync already keeps out of Webflow.
 */
export function isClassPast(classEntity: Class, now: Date): boolean {
  if (classEntity.sessions.length === 0) return false;

  const lastStart = Math.max(...classEntity.sessions.map(toTime));
  const endsAt = lastStart + classEntity.durationMinutes * 60 * 1000;

  return endsAt < now.getTime();
}

/**
 * Past classes whose Webflow page is not live, so the sweep can put it back.
 *
 * Past class pages stay up as a record of what the studio has run: for search,
 * for AI answers and aggregators, and for prospective instructors. The class
 * page shows them as past (no registration) and links to upcoming classes.
 * Until 2026-11 this sweep unpublished them instead, which left every past
 * offering as a 404.
 *
 * Only `published` classes with a Webflow item are restored. A draft or
 * cancelled class was removed from Webflow on purpose by the class sync, and a
 * class without a `webflowItemId` has never been synced.
 *
 * Driving the "is it live?" half off Webflow rather than a Firestore flag makes
 * the sweep idempotent for free: once an item is live again it appears in
 * `listItemsLive`, so the next run skips it with no bookkeeping field to keep
 * in sync.
 */
export function findPastClassesToRestore(
  classes: Class[],
  liveItemIdsByFirebaseId: Map<string, string>,
  now: Date
): { classId: string; name: string; webflowItemId: string }[] {
  const restore: { classId: string; name: string; webflowItemId: string }[] =
    [];
  for (const classEntity of classes) {
    if (classEntity.status !== 'published') continue;
    if (!classEntity.webflowItemId) continue;
    if (!isClassPast(classEntity, now)) continue;
    if (liveItemIdsByFirebaseId.has(classEntity.id)) continue;
    restore.push({
      classId: classEntity.id,
      name: classEntity.name,
      webflowItemId: classEntity.webflowItemId,
    });
  }
  return restore;
}
